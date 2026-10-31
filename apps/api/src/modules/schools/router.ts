import { appOrigin } from '#/kernel/config.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { rateLimit } from '#/kernel/rate-limit/rate-limit.ts'
import { can, rolePermissions } from '#/permissions.ts'
import { acceptInvitation, getInvitation, inviteStaff } from './invitations.service.ts'
import { avatarUrlOf, changeStaffRole, listStaff, setStaffStatus, updateMyAvatar } from './members.service.ts'
import { createSchool, listMySchools } from './service.ts'

export const schoolsRouter = {
	create: impl.schools.create
		.use(mw.host)
		.use(mw.session)
		.use(rateLimit({ name: 'schools.create', max: 5, windowSeconds: 3600, by: 'user' }))
		.handler(async ({ input, context }) => {
			if (context.host.kind !== 'root') fail.notFound('NOT_ON_ROOT_DOMAIN')
			const { school } = await createSchool(input, { userId: context.user.id, ip: context.ip })
			return {
				id: school.id,
				slug: school.slug,
				name: school.name,
				role: 'owner' as const,
				url: appOrigin(school.slug),
			}
		}),

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

	me: impl.schools.me
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.access'))
		.handler(({ context }) => meOf(schoolCtx(context))),

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
			return meOf(ctx)
		}),
}

async function meOf(ctx: SchoolCtx) {
	return {
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
		.use(mw.tenantTx)
		.handler(async ({ input, context }) => ({
			...(await getInvitation(context.db, input.token, context.now())),
			school: context.school,
		})),

	accept: impl.invitations.accept
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.handler(async ({ input, context }) => {
			const res = await acceptInvitation(context.db, input.token, context.user, context.now())
			if (!res.role) throw new Error('приглашение принято без роли')
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
