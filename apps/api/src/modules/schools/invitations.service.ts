// Приглашения сотрудников (скилл lms-school): письмо со ссылкой /invite/<token>; принять может только владелец email.
import { createHash, randomBytes } from 'node:crypto'
import { type StaffInvite, StaffInvite as StaffInviteSchema } from '@dinastia/contracts/schools'
import { and, eq } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx, SchoolCtx, Tx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { deliverEmail } from '#/kernel/mail/send.ts'
import { members } from '#/kernel/members/schema.ts'
import { invitationEmail } from './emails/invitation.tsx'
import { sendInvitationJob } from './jobs.ts'
import { invitations } from './schema.ts'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
/** Хэш случайного значения, которое никто не знает: приглашение не принять, пока задача не выпустит токен. */
const unusableHash = () => hashToken(randomBytes(32).toString('base64url'))

/**
 * Пригласить сотрудника или продлить действующее приглашение на тот же email. Роль admin выдаёт только владелец.
 * Письмо уходит задачей schools.send-invitation: она же выпускает токен (здесь — только заглушка хэша), чтобы токен
 * не лежал в очереди. Откат транзакции — ни приглашения, ни письма.
 */
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

	const values = {
		email,
		role,
		tokenHash: unusableHash(),
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
	// email — ПДн: в журнале только роль, адрес — в строке приглашения
	await ctx.audit('schools.invitation.sent', { entity: 'invitation', id: invitation.id, diff: { role } })
	await ctx.jobs.send(sendInvitationJob, { invitationId: invitation.id })
	return { invitationId: invitation.id, expiresAt: invitation.expiresAt }
}

/**
 * Задача: выпустить токен и отправить письмо-приглашение. Повтор выпускает новый токен — ссылка из прежнего письма
 * перестаёт работать; приглашение уже не pending или истекло — ничего не делать.
 */
export async function sendInvitation(ctx: BaseCtx, invitationId: string) {
	const [inv] = await ctx.db
		.select({
			email: invitations.email,
			role: invitations.role,
			status: invitations.status,
			expiresAt: invitations.expiresAt,
			inviterName: users.name,
		})
		.from(invitations)
		.leftJoin(members, eq(members.id, invitations.invitedBy))
		.leftJoin(users, eq(users.id, members.userId))
		.where(eq(invitations.id, invitationId))
		.limit(1)
	if (inv?.status !== 'pending' || inv.expiresAt <= ctx.now()) {
		ctx.log.info({ invitationId }, 'invitation is not pending, email skipped')
		return
	}
	if (inv.role === 'student') throw new Error('приглашение с ролью student')
	const token = randomBytes(32).toString('base64url')
	await ctx.db
		.update(invitations)
		.set({ tokenHash: hashToken(token) })
		.where(eq(invitations.id, invitationId))
	await deliverEmail(ctx.school, invitationEmail, {
		to: inv.email,
		data: {
			// владельца созданной школы приглашает оператор (5.6)
			inviterName: inv.inviterName ?? 'Dinastia',
			role: inv.role,
			url: `${appOrigin(ctx.school.slug)}/invite/${token}`,
			expiresAt: inv.expiresAt,
		},
	})
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
