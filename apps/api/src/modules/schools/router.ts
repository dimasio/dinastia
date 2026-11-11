import { schools } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
// biome-ignore lint/style/noRestrictedImports: почта оператора для баннера «поддержка Dinastia» — глобальная таблица users (5.6г)
import { db } from '#/kernel/db/client.ts'
import { fail } from '#/kernel/errors.ts'
import { type Impersonation, impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { rateLimit } from '#/kernel/rate-limit/rate-limit.ts'
import { cancelSchoolDeletion, requestSchoolDeletion } from '#/kernel/school-deletion/school-deletion.ts'
import { can, rolePermissions } from '#/permissions.ts'
import { acceptInvitation, getInvitation, inviteStaff } from './invitations.service.ts'
import { recordPdConsent, schoolLegal } from './legal.ts'
import { avatarUrlOf, changeStaffRole, listStaff, setStaffStatus, updateMyAvatar } from './members.service.ts'
import { listMySchools, recordOwnerConsents } from './service.ts'
import { getSupportAccess, setSupportAccess } from './support-access.ts'

export const schoolsRouter = {
	mine: impl.schools.mine
		.use(mw.host)
		.use(mw.session)
		.handler(async ({ context }) =>
			(await listMySchools(context.user.id)).map((s) => ({ ...s, url: appOrigin(s.slug) })),
		),

	current: impl.schools.current
		.use(mw.host)
		.use(mw.school)
		.handler(({ context }) => context.school),

	requestDeletion: impl.schools.requestDeletion
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.delete'))
		.use(rateLimit({ name: 'schools.delete', max: 5, windowSeconds: 3600, by: 'member' }))
		.handler(({ input, context }) => requestSchoolDeletion(schoolCtx(context), input.slug)),

	cancelDeletion: impl.schools.cancelDeletion
		.use(mw.host)
		.use(mw.session)
		.use(rateLimit({ name: 'schools.cancel-deletion', max: 20, windowSeconds: 3600, by: 'user' }))
		.handler(async ({ input, context }) => {
			if (context.host.kind !== 'root') fail.notFound('NOT_ON_ROOT_DOMAIN')
			await cancelSchoolDeletion(context.user.id, input.id, { ip: context.ip })
			const mine = await listMySchools(context.user.id)
			const school = mine.find((s) => s.id === input.id)
			if (!school) return fail.notFound('SCHOOL_NOT_FOUND')
			return { ...school, url: appOrigin(school.slug) }
		}),

	legal: impl.schools.legal
		.use(mw.host)
		.use(mw.school)
		.use(mw.tenantTx)
		.handler(({ context }) => schoolLegal(context.db, context.school)),

	me: impl.schools.me
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.access'))
		.handler(({ context }) => meOf(schoolCtx(context), context.impersonation)),

	supportAccess: {
		get: impl.schools.supportAccess.get
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('schools.settings.manage'))
			.handler(({ context }) => getSupportAccess(schoolCtx(context))),
		set: impl.schools.supportAccess.set
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('schools.settings.manage'))
			.handler(({ input, context }) => setSupportAccess(schoolCtx(context), input.open)),
	},

	updateMyAvatar: impl.schools.updateMyAvatar
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.access'))
		.handler(async ({ input, context }) => {
			const ctx = schoolCtx(context)
			await updateMyAvatar(ctx, input.fileId)
			return meOf(ctx, context.impersonation)
		}),
}

async function meOf(ctx: SchoolCtx, impersonation?: Impersonation | null) {
	const [operator] = impersonation
		? await db.select({ email: users.email }).from(users).where(eq(users.id, impersonation.operatorId))
		: []
	const [school] = await ctx.db
		.select({ status: schools.status, reason: schools.suspendedReason, at: schools.suspendedAt })
		.from(schools)
		.where(eq(schools.id, ctx.school.id))
	return {
		impersonation: operator ? { operatorEmail: operator.email } : null,
		suspension: school?.status === 'suspended' && school.at ? { reason: school.reason, at: school.at } : null,
		user: ctx.user,
		member: { ...ctx.member, avatarUrl: await avatarUrlOf(ctx, ctx.member.id) },
		school: ctx.school,
		permissions: rolePermissions(ctx.member.role),
	}
}

export const invitationsRouter = {
	create: impl.invitations.create
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.members.manage'))
		.use(rateLimit({ name: 'schools.invite', max: 30, windowSeconds: 3600, by: 'member' }))
		.handler(async ({ input, context }) => {
			const inv = await inviteStaff(schoolCtx(context), input)
			return { id: inv.invitationId, expiresAt: inv.expiresAt }
		}),

	get: impl.invitations.get
		.use(mw.host)
		.use(mw.school)
		// токен не перебрать, но страницу открывает гость — лимит по IP (5.1)
		.use(rateLimit({ name: 'invitations.get', max: 60, windowSeconds: 600, by: 'ip' }))
		.use(mw.tenantTx)
		.handler(async ({ input, context }) => ({
			...(await getInvitation(context.db, input.token, context.now())),
			school: context.school,
			legal: await schoolLegal(context.db, context.school),
		})),

	accept: impl.invitations.accept
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(rateLimit({ name: 'invitations.accept', max: 20, windowSeconds: 3600, by: 'user' }))
		.use(mw.tenantTx)
		.handler(async ({ input, context }) => {
			const res = await acceptInvitation(context.db, input.token, context.user, context.now())
			if (!res.role) throw new Error('приглашение принято без роли')
			const consent = { userId: context.user.id, schoolId: context.school.id, ip: context.ip }
			// владелец — клиент Dinastia: оферта и политика платформы; сотрудник — согласие на обработку ПДн школой (5.5, 5.6)
			if (res.role === 'owner') await recordOwnerConsents(context.db, consent)
			else await recordPdConsent(context.db, consent)
			return { role: res.role, school: context.school }
		}),
}

const member = () => impl.members
export const membersRouter = {
	list: member()
		.list.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.members.read'))
		.handler(({ input, context }) => listStaff(schoolCtx(context), input)),

	changeRole: member()
		.changeRole.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.members.manage'))
		.handler(({ input, context }) => changeStaffRole(schoolCtx(context), input)),

	setStatus: member()
		.setStatus.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.members.manage'))
		.handler(({ input, context }) => setStaffStatus(schoolCtx(context), input)),
}
