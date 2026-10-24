// Приглашения сотрудников (скилл lms-school): письмо со ссылкой /invite/<token>; принять может только владелец email.
import { createHash, randomBytes } from 'node:crypto'
import { type StaffInvite, StaffInvite as StaffInviteSchema } from '@dinastia/contracts/schools'
import { and, eq } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import type { Tx } from '#/kernel/db/client.ts'
import { fail } from '#/kernel/errors.ts'
import { sendMail } from '#/kernel/mail.ts'
import { members } from '#/kernel/members/schema.ts'
import { invitations } from './schema.ts'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Пригласить сотрудника или продлить действующее приглашение на тот же email. Роль admin выдаёт только владелец. */
export async function inviteStaff(ctx: SchoolCtx, input: StaffInvite) {
	const { email, role } = StaffInviteSchema.parse(input)
	if (!ctx.can('schools.members.manage')) fail.forbidden('NO_PERMISSION')
	if (role === 'admin' && ctx.member.role !== 'owner') fail.forbidden('ONLY_OWNER_INVITES_ADMIN')

	const [existing] = await ctx.db
		.select({ id: members.id })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(users.email, email))
		.limit(1)
	if (existing) fail.conflict('ALREADY_MEMBER', { email })

	const token = randomBytes(32).toString('base64url')
	const values = {
		email,
		role,
		tokenHash: hashToken(token),
		invitedBy: ctx.member.id,
		expiresAt: new Date(ctx.now().getTime() + INVITATION_TTL_MS),
	}
	const [invitation] = await ctx.db
		.insert(invitations)
		.values(values)
		.onConflictDoUpdate({
			target: [invitations.schoolId, invitations.email],
			targetWhere: eq(invitations.status, 'pending'),
			set: { role: values.role, tokenHash: values.tokenHash, invitedBy: values.invitedBy, expiresAt: values.expiresAt },
		})
		.returning({ id: invitations.id, expiresAt: invitations.expiresAt })
	if (!invitation) throw new Error('приглашение не создано')

	const url = `${appOrigin(ctx.school.slug)}/invite/${token}`
	await sendMail({
		to: email,
		subject: `Приглашение в школу «${ctx.school.name}»`,
		text: `${ctx.user.name} приглашает вас в школу «${ctx.school.name}».\n\nПринять приглашение (ссылка действует 7 дней):\n${url}`,
	})
	return { invitationId: invitation.id, expiresAt: invitation.expiresAt, url }
}

async function findPending(tx: Tx, token: string, now: Date) {
	const [inv] = await tx
		.select()
		.from(invitations)
		.where(eq(invitations.tokenHash, hashToken(token)))
		.limit(1)
	if (inv?.status !== 'pending') return fail.notFound('INVITATION_NOT_FOUND')
	if (inv.expiresAt <= now) return fail.conflict('INVITATION_EXPIRED')
	return inv
}

/** Публичные сведения о приглашении для страницы /invite/<token> (в транзакции школы из хоста). */
export async function getInvitation(tx: Tx, token: string, now = new Date()) {
	const inv = await findPending(tx, token, now)
	return { email: inv.email, role: inv.role, expiresAt: inv.expiresAt }
}

/** Принять приглашение вошедшим пользователем: email сессии должен совпасть с email приглашения. */
export async function acceptInvitation(tx: Tx, token: string, user: { id: string; email: string }, now = new Date()) {
	const inv = await findPending(tx, token, now)
	if (inv.email !== user.email.toLowerCase()) fail.forbidden('INVITATION_EMAIL_MISMATCH')

	const [already] = await tx.select().from(members).where(eq(members.userId, user.id)).limit(1)
	if (already?.status === 'blocked') fail.forbidden('MEMBER_BLOCKED')
	const member =
		already ??
		(await tx.insert(members).values({ userId: user.id, role: inv.role, invitedBy: inv.invitedBy }).returning())[0]

	await tx
		.update(invitations)
		.set({ status: 'accepted', acceptedAt: now, acceptedByUserId: user.id })
		.where(and(eq(invitations.id, inv.id), eq(invitations.status, 'pending')))
	return { memberId: member?.id, role: member?.role }
}
