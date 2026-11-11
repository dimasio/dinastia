// Плагин better-auth «вход от имени» (5.6г): своя версия механики admin-плагина better-auth — сессия оператора сохраняется в
// подписанной cookie и восстанавливается при выходе; новая сессия — участника, с `impersonated_by` и школой, 1 час. Проверки —
// `kernel/ops/impersonation.ts`; под такой сессией запрещены изменения аккаунта (пароль, почта, имя) — это не дело поддержки.
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from 'better-auth/api'
import { expireCookie, setSessionCookie } from 'better-auth/cookies'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { appOrigin } from '../config.ts'
import { withTenant } from '../db/tenant.ts'
import { AppError } from '../errors.ts'
import { members } from '../members/schema.ts'
import { checkImpersonation, IMPERSONATION_TTL_SECONDS, logImpersonation } from '../ops/impersonation.ts'

const OPERATOR_COOKIE = 'ops_session'
/** Под сессией «от имени» в better-auth можно только это: прочитать сессию, выйти, вернуться оператором. */
const ALLOWED = ['/get-session', '/sign-out', '/impersonation/stop']

const STATUS = { notFound: 'NOT_FOUND', forbidden: 'FORBIDDEN', conflict: 'CONFLICT', invalid: 'BAD_REQUEST' } as const

function toApiError(error: unknown): never {
	if (error instanceof AppError)
		throw new APIError(STATUS[error.kind as keyof typeof STATUS] ?? 'BAD_REQUEST', {
			message: error.code,
			code: error.code,
		})
	throw error
}

const ip = (headers: Headers | undefined) => headers?.get('x-dinastia-client-ip') ?? null

export const impersonation = () =>
	({
		id: 'dinastia-impersonation',
		schema: {
			session: {
				fields: {
					impersonatedBy: { type: 'string', required: false, input: false },
					impersonationSchoolId: { type: 'string', required: false, input: false },
				},
			},
		},
		hooks: {
			before: [
				{
					matcher: (ctx) => ctx.request?.method !== 'GET' && !ALLOWED.some((p) => ctx.path === p),
					handler: createAuthMiddleware(async (ctx) => {
						const session = await getSessionFromCtx(ctx).catch(() => null)
						if ((session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy)
							throw new APIError('FORBIDDEN', { message: 'IMPERSONATION_FORBIDDEN', code: 'IMPERSONATION_FORBIDDEN' })
					}),
				},
			],
		},
		endpoints: {
			startImpersonation: createAuthEndpoint(
				'/impersonation/start',
				{
					method: 'POST',
					body: z.object({ schoolId: z.uuid(), memberId: z.uuid() }),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const own = ctx.context.session
					if ((own.session as { impersonatedBy?: string | null }).impersonatedBy)
						throw new APIError('BAD_REQUEST', { message: 'IMPERSONATION_NESTED', code: 'IMPERSONATION_NESTED' })
					const { school, member } = await checkImpersonation(own.user.id, ctx.body, new Date()).catch(toApiError)
					const target = await ctx.context.internalAdapter.findUserById(member.userId)
					if (!target) throw new APIError('NOT_FOUND', { message: 'MEMBER_NOT_FOUND', code: 'MEMBER_NOT_FOUND' })
					const session = await ctx.context.internalAdapter.createSession(
						target.id,
						true,
						{
							impersonatedBy: own.user.id,
							impersonationSchoolId: school.id,
							expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000),
						},
						true,
					)
					if (!session) throw new APIError('INTERNAL_SERVER_ERROR')
					const cookie = ctx.context.createAuthCookie(OPERATOR_COOKIE)
					await ctx.setSignedCookie(
						cookie.name,
						own.session.token,
						ctx.context.secret,
						ctx.context.authCookies.sessionToken.attributes,
					)
					await setSessionCookie(ctx, { session, user: target }, true)
					await logImpersonation('started', {
						operatorId: own.user.id,
						schoolId: school.id,
						memberId: ctx.body.memberId,
						ip: ip(ctx.headers),
					})
					return ctx.json({ url: `${appOrigin(school.slug)}${member.role === 'student' ? '/learn' : '/admin'}` })
				},
			),
			stopImpersonation: createAuthEndpoint(
				'/impersonation/stop',
				{ method: 'POST', requireHeaders: true },
				async (ctx) => {
					const current = await getSessionFromCtx(ctx)
					const s = current?.session as
						| { impersonatedBy?: string | null; impersonationSchoolId?: string | null }
						| undefined
					if (!current || !s?.impersonatedBy || !s.impersonationSchoolId)
						throw new APIError('BAD_REQUEST', { message: 'NOT_IMPERSONATING', code: 'NOT_IMPERSONATING' })
					const cookie = ctx.context.createAuthCookie(OPERATOR_COOKIE)
					const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
					const back = token ? await ctx.context.internalAdapter.findSession(token) : null
					await ctx.context.internalAdapter.deleteSession(current.session.token)
					expireCookie(ctx, cookie)
					const [member] = await withTenant(s.impersonationSchoolId, (tx) =>
						tx.select({ id: members.id }).from(members).where(eq(members.userId, current.user.id)),
					)
					await logImpersonation('ended', {
						operatorId: s.impersonatedBy,
						schoolId: s.impersonationSchoolId,
						memberId: member?.id ?? current.user.id,
						ip: ip(ctx.headers),
					})
					// сессия оператора жива — возвращаемся в консоль; нет (истекла) — на вход
					if (back && back.session.userId === s.impersonatedBy) await setSessionCookie(ctx, back, true)
					return ctx.json({ url: `${appOrigin()}/ops/schools/${s.impersonationSchoolId}` })
				},
			),
		},
	}) satisfies import('better-auth').BetterAuthPlugin
