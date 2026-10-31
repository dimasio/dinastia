// Базовые процедуры oRPC (architecture §4, скилл api-endpoints):
//   pub       — без входа; ctx.host — что за хост (корень / школа / неизвестно)
//   authed    — нужна сессия; ctx.user
//   atSchool  — хост школы + транзакция школы (ctx.db), без требования членства (приглашения)
//   school    — вошедший активный участник школы хоста: полный SchoolCtx (db, school, user, member, now, emit, jobs)
import { type Contract, contract } from '@dinastia/contracts'
import { schools } from '@dinastia/db'
import { implement, ORPCError, os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { ZodError } from 'zod'
import { auditFor } from './audit/audit.ts'
import { auth } from './auth/auth.ts'
import { config } from './config.ts'
import type { SchoolCtx } from './context.ts'
import { db, type Tx } from './db/client.ts'
import { withTenant } from './db/tenant.ts'
import { AppError } from './errors.ts'
import { type HostTarget, resolveHost } from './host.ts'
import type { Logger } from './log.ts'
import { findActiveMember } from './members/members.ts'
import { tenantCtx } from './tenant-ctx.ts'

/** Контекст, который HTTP-слой передаёт в каждую процедуру. */
export interface RequestCtx {
	headers: Headers
	ip: string | null
	now: () => Date
	/** Логгер запроса: requestId, дальше цепочка добавляет userId, schoolId, memberId (скилл observability). */
	log: Logger
	requestId: string
	/** Поля для итоговой строки лога запроса (schoolId, userId, memberId) — без ПДн. */
	tags: Record<string, string>
}

/** Первым в каждой цепочке: бизнес-ошибки сервисов (AppError) и ошибки схем в сервисах — в ответ API, а не 500. */
const errorsMw = os.$context<RequestCtx>().middleware(async ({ context, next, path }) => {
	try {
		return await next()
	} catch (error) {
		const mapped = toORPCError(error)
		// Ожидаемые ошибки (бизнес, валидация, права) — не шум; всё остальное — ошибка сервера: в лог с requestId.
		if (!(mapped instanceof ORPCError)) context.log.error({ err: error, procedure: path.join('.') }, 'procedure failed')
		throw mapped
	}
})

export const impl = implement<Contract, RequestCtx>(contract).$context<RequestCtx>().use(errorsMw)

type School = SchoolCtx['school']
type User = SchoolCtx['user']

const hostMw = os.$context<RequestCtx>().middleware(async ({ context, next }) => {
	const host: HostTarget = resolveHost(context.headers.get('host') ?? undefined, config.APP_DOMAIN)
	return next({ context: { host } })
})

const sessionMw = os.$context<RequestCtx>().middleware(async ({ context, next }) => {
	const session = await auth.api.getSession({ headers: context.headers })
	if (!session) throw new ORPCError('UNAUTHORIZED', { message: 'UNAUTHENTICATED', data: { code: 'UNAUTHENTICATED' } })
	const user: User = { id: session.user.id, email: session.user.email, name: session.user.name }
	context.tags.userId = user.id
	return next({ context: { user, log: context.log.child({ userId: user.id }) } })
})

const schoolMw = os.$context<RequestCtx & { host: HostTarget }>().middleware(async ({ context, next }) => {
	if (context.host.kind !== 'school') throw notFound('SCHOOL_NOT_FOUND')
	const [row] = await db.select().from(schools).where(eq(schools.slug, context.host.slug)).limit(1)
	if (row?.status !== 'active') throw notFound('SCHOOL_NOT_FOUND')
	const school: School = { id: row.id, slug: row.slug, name: row.name }
	context.tags.schoolId = school.id
	return next({ context: { school, log: context.log.child({ schoolId: school.id }) } })
})

/** Транзакция школы на всё время процедуры: ctx.db видит только её данные (RLS). */
const tenantTxMw = os.$context<RequestCtx & { school: School; user?: User }>().middleware(async ({ context, next }) =>
	withTenant(context.school.id, async (tx: Tx) => await next({ context: { db: tx } }), {
		userId: context.user?.id,
	}),
)

const memberMw = os
	.$context<RequestCtx & { school: School; user: User; db: Tx }>()
	.middleware(async ({ context, next }) => {
		const member = await findActiveMember(context.db, context.user.id)
		if (!member) throw new ORPCError('FORBIDDEN', { message: 'NOT_A_MEMBER', data: { code: 'NOT_A_MEMBER' } })
		context.tags.memberId = member.id
		return next({ context: { member, log: context.log.child({ memberId: member.id, role: member.role }) } })
	})

const notFound = (code: string) => new ORPCError('NOT_FOUND', { message: code, data: { code } })

export const mw = { host: hostMw, session: sessionMw, school: schoolMw, tenantTx: tenantTxMw, member: memberMw }

/** SchoolCtx для сервисов из контекста цепочки `school`. */
export function schoolCtx(
	c: RequestCtx & { db: Tx; school: School; user: User; member: SchoolCtx['member']; can: SchoolCtx['can'] },
): SchoolCtx {
	return {
		...tenantCtx(c.db, c.school, c),
		audit: auditFor(c.db, { memberId: c.member.id, requestId: c.requestId, ip: c.ip }),
		user: c.user,
		member: c.member,
		can: c.can,
	}
}

/** AppError сервиса → ORPCError с тем же HTTP-классом и `data.code` (скилл data-access). */
export function toORPCError(error: unknown): unknown {
	if (error instanceof ZodError) {
		return new ORPCError('BAD_REQUEST', {
			message: 'INVALID_INPUT',
			data: { code: 'INVALID_INPUT', issues: error.issues },
			cause: error,
		})
	}
	if (!(error instanceof AppError)) return error
	const code = {
		invalid: 'BAD_REQUEST',
		unauthorized: 'UNAUTHORIZED',
		forbidden: 'FORBIDDEN',
		notFound: 'NOT_FOUND',
		conflict: 'CONFLICT',
		tooMany: 'TOO_MANY_REQUESTS',
	}[error.kind]
	return new ORPCError(code, { message: error.code, data: { code: error.code, ...error.data }, cause: error })
}
