// Приглашения на курс (скилл lms-learners, карточка 4.1(б)): ссылка (много использований, срок, лимит, отзыв) и адресное
// приглашение на почту (одно использование). В БД — хэш токена; ссылку видно один раз при создании, адресную выпускает задача.
import { createHash, randomBytes } from 'node:crypto'
import type { InviteRow } from '@dinastia/contracts/learning'
import { and, desc, eq, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx, SchoolCtx, Tx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { deliverEmail } from '#/kernel/mail/send.ts'
import { members } from '#/kernel/members/schema.ts'
import { courseCards, publishedOutline } from '../courses/service.ts'
import { courseInvitationEmail } from './emails/course-invitation.tsx'
import { enroll } from './enrollment.service.ts'
import { sendCourseInvitationJob } from './jobs.ts'
import { enrollmentInvites } from './schema.ts'

type Invite = typeof enrollmentInvites.$inferSelect
const DAY_MS = 24 * 60 * 60 * 1000
const EMAIL_INVITE_DAYS = 7

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
/** Хэш значения, которого никто не знает: адресное приглашение не принять, пока задача не выпустит токен. */
const unusableHash = () => hashToken(newToken())

function statusOf(i: Invite, now: Date): InviteRow['status'] {
	if (i.revokedAt) return 'revoked'
	if (i.expiresAt <= now) return 'expired'
	if (i.maxUses !== null && i.uses >= i.maxUses) return 'exhausted'
	return 'active'
}

const rowOf = (i: Invite, now: Date): InviteRow => ({
	id: i.id,
	email: i.email,
	status: statusOf(i, now),
	expiresAt: i.expiresAt,
	maxUses: i.maxUses,
	uses: i.uses,
	createdAt: i.createdAt,
})

async function publishedCourse(ctx: BaseCtx, courseId: string) {
	const outline = await publishedOutline(ctx, courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	if (outline.course.status !== 'published') return fail.conflict('COURSE_NOT_PUBLISHED')
	return outline
}

export async function listInvites(ctx: SchoolCtx, courseId: string): Promise<InviteRow[]> {
	const rows = await ctx.db
		.select()
		.from(enrollmentInvites)
		.where(eq(enrollmentInvites.courseId, courseId))
		.orderBy(desc(enrollmentInvites.createdAt))
	const now = ctx.now()
	return rows.map((r) => rowOf(r, now))
}

/** Ссылка-приглашение: токен в ответе один раз, дальше только хэш. */
export async function createLinkInvite(
	ctx: SchoolCtx,
	input: { courseId: string; expiresInDays: number; maxUses?: number | undefined },
) {
	await publishedCourse(ctx, input.courseId)
	const token = newToken()
	const [row] = await ctx.db
		.insert(enrollmentInvites)
		.values({
			courseId: input.courseId,
			tokenHash: hashToken(token),
			expiresAt: new Date(ctx.now().getTime() + input.expiresInDays * DAY_MS),
			maxUses: input.maxUses ?? null,
			createdByMemberId: ctx.member.id,
		})
		.returning()
	const invite = row as Invite
	await ctx.audit('learning.invite.created', {
		entity: 'enrollment_invite',
		id: invite.id,
		diff: { courseId: input.courseId, maxUses: input.maxUses ?? null },
	})
	return { invite: rowOf(invite, ctx.now()), url: `${appOrigin(ctx.school.slug)}/join/${token}` }
}

export async function revokeInvite(ctx: SchoolCtx, id: string): Promise<InviteRow> {
	const [row] = await ctx.db
		.update(enrollmentInvites)
		.set({ revokedAt: ctx.now() })
		.where(and(eq(enrollmentInvites.id, id), sql`${enrollmentInvites.revokedAt} is null`))
		.returning()
	if (!row) {
		const [exists] = await ctx.db.select().from(enrollmentInvites).where(eq(enrollmentInvites.id, id))
		if (!exists) return fail.notFound('INVITE_NOT_FOUND')
		return rowOf(exists, ctx.now())
	}
	await ctx.audit('learning.invite.revoked', { entity: 'enrollment_invite', id })
	return rowOf(row, ctx.now())
}

/**
 * Адресное приглашение на почту (преподаватель, незнакомая почта). Повтор на ту же почту и курс продлевает действующее.
 * Письмо уходит задачей, она же выпускает токен — в очереди его нет.
 */
export async function inviteByEmail(ctx: SchoolCtx, input: { courseId: string; email: string }) {
	await publishedCourse(ctx, input.courseId)
	const expiresAt = new Date(ctx.now().getTime() + EMAIL_INVITE_DAYS * DAY_MS)
	const [open] = await ctx.db
		.select()
		.from(enrollmentInvites)
		.where(
			and(
				eq(enrollmentInvites.courseId, input.courseId),
				eq(enrollmentInvites.email, input.email),
				sql`${enrollmentInvites.revokedAt} is null and ${enrollmentInvites.uses} < 1 and ${enrollmentInvites.expiresAt} > ${ctx.now()}`,
			),
		)
		.limit(1)
	const [row] = open
		? await ctx.db
				.update(enrollmentInvites)
				.set({ expiresAt, tokenHash: unusableHash(), createdByMemberId: ctx.member.id })
				.where(eq(enrollmentInvites.id, open.id))
				.returning()
		: await ctx.db
				.insert(enrollmentInvites)
				.values({
					courseId: input.courseId,
					email: input.email,
					tokenHash: unusableHash(),
					expiresAt,
					maxUses: 1,
					createdByMemberId: ctx.member.id,
				})
				.returning()
	const invite = row as Invite
	// почта — ПДн: в журнале только курс
	await ctx.audit('learning.invite.sent', {
		entity: 'enrollment_invite',
		id: invite.id,
		diff: { courseId: input.courseId },
	})
	await ctx.jobs.send(sendCourseInvitationJob, { inviteId: invite.id })
	return invite
}

/** Задача: выпустить токен и отправить письмо. Повтор выпускает новый токен; приглашение уже не действует — письма нет. */
export async function sendCourseInvitation(ctx: BaseCtx, inviteId: string) {
	const [inv] = await ctx.db
		.select({ invite: enrollmentInvites, inviterName: users.name })
		.from(enrollmentInvites)
		.innerJoin(members, eq(members.id, enrollmentInvites.createdByMemberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(enrollmentInvites.id, inviteId))
		.limit(1)
	if (!inv?.invite.email || statusOf(inv.invite, ctx.now()) !== 'active') {
		ctx.log.info({ inviteId }, 'course invite is not active, email skipped')
		return
	}
	const [card] = await courseCards(ctx, [inv.invite.courseId])
	const token = newToken()
	await ctx.db
		.update(enrollmentInvites)
		.set({ tokenHash: hashToken(token) })
		.where(eq(enrollmentInvites.id, inviteId))
	await deliverEmail(ctx.school, courseInvitationEmail, {
		to: inv.invite.email,
		data: {
			inviterName: inv.inviterName,
			courseTitle: card?.title ?? '',
			url: `${appOrigin(ctx.school.slug)}/join/${token}`,
			expiresAt: inv.invite.expiresAt,
		},
	})
}

/** Действующее приглашение по токену; `lock` — под блокировкой строки (принятие). */
async function findJoin(tx: Tx, token: string, now: Date, lock = false): Promise<Invite> {
	const q = tx
		.select()
		.from(enrollmentInvites)
		.where(eq(enrollmentInvites.tokenHash, hashToken(token)))
		.limit(1)
	const [inv] = await (lock ? q.for('update') : q)
	if (!inv) return fail.notFound('JOIN_NOT_FOUND')
	const status = statusOf(inv, now)
	if (status === 'revoked') return fail.conflict('JOIN_REVOKED')
	if (status === 'expired') return fail.conflict('JOIN_EXPIRED')
	if (status === 'exhausted') return fail.conflict('JOIN_EXHAUSTED')
	return inv
}

/** Публичные сведения для страницы /join/<токен>. */
export async function getJoin(ctx: BaseCtx, token: string) {
	const inv = await findJoin(ctx.db, token, ctx.now())
	const [card] = await courseCards(ctx, [inv.courseId])
	if (!card) return fail.notFound('JOIN_NOT_FOUND')
	return { school: ctx.school, courseTitle: card.title, email: inv.email, expiresAt: inv.expiresAt }
}

/**
 * Принять приглашение вошедшим пользователем: участник `student` создаётся (если его нет), затем зачисление
 * (источник `link`/`invite`). Использование считается один раз на человека; сотрудник и заблокированный — отказ.
 */
export async function acceptJoin(ctx: BaseCtx, token: string, user: { id: string; email: string }) {
	const inv = await findJoin(ctx.db, token, ctx.now(), true)
	if (inv.email && inv.email !== user.email.toLowerCase()) return fail.forbidden('JOIN_EMAIL_MISMATCH')
	await publishedCourse(ctx, inv.courseId)
	const [existing] = await ctx.db.select().from(members).where(eq(members.userId, user.id)).limit(1)
	if (existing && existing.role !== 'student') return fail.conflict('NOT_A_STUDENT')
	if (existing?.status === 'blocked') return fail.forbidden('MEMBER_BLOCKED')
	const member =
		existing ??
		(
			await ctx.db
				.insert(members)
				.values({ userId: user.id, role: 'student', invitedBy: inv.createdByMemberId })
				.returning()
		)[0]
	if (!member) throw new Error('участник не создан')
	const { enrollment, outcome } = await enroll(ctx, {
		memberId: member.id,
		courseId: inv.courseId,
		source: inv.email ? 'invite' : 'link',
		inviteId: inv.id,
	})
	if (outcome !== 'already') {
		await ctx.db
			.update(enrollmentInvites)
			.set({ uses: sql`${enrollmentInvites.uses} + 1` })
			.where(eq(enrollmentInvites.id, inv.id))
		await ctx.audit(`learning.enrollment.${outcome}`, {
			entity: 'enrollment',
			id: enrollment.id,
			diff: { courseId: inv.courseId, inviteId: inv.id },
		})
	}
	return { courseId: inv.courseId, school: ctx.school }
}
