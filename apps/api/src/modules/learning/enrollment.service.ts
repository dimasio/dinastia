// Зачисление, сроки и отзыв доступа (скилл lms-learners, карточка 4.1): зачисление по почте, продление, отзыв и возврат,
// список учеников курса. Курс — публичный API модуля courses; аккаунты ученикам создают владелец и администраторы.
import { randomBytes } from 'node:crypto'
import type { EnrollmentListQuery, EnrollmentRow } from '@dinastia/contracts/learning'
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'
import { auth } from '#/kernel/auth/auth.ts'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courseCards, publishedOutline } from '../courses/service.ts'
import { enrolledEmail } from './emails/enrolled.tsx'
import { enrollments } from './schema.ts'

type Enrollment = typeof enrollments.$inferSelect
const DAY_MS = 24 * 60 * 60 * 1000
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/**
 * Область списка учеников для проверяющих и преподавателей. До потоков (4.2) — все ученики школы (изоляция школ — RLS);
 * в 4.2 для куратора здесь появится ограничение по его группам.
 */
export function learningScope(_ctx: SchoolCtx): SQL | undefined {
	return undefined
}

export type EnrollOutcome = 'enrolled' | 'restored' | 'already'

/**
 * Зачислить участника на курс (внутренняя функция и основа `enrollByEmail`). Опубликованный курс; срок — `accessDays`
 * (не указан — срок курса по умолчанию, `null` — без срока). Действующее зачисление возвращается как есть (`already`);
 * отозванное и истёкшее — возвращаются с прежним прогрессом и новым сроком (`restored`).
 */
export async function enroll(
	ctx: BaseCtx,
	input: { memberId: string; courseId: string; source?: Enrollment['source']; accessDays?: number | null },
): Promise<{ enrollment: Enrollment; outcome: EnrollOutcome }> {
	const outline = await publishedOutline(ctx, input.courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	if (outline.course.status !== 'published') return fail.conflict('COURSE_NOT_PUBLISHED')
	const days = input.accessDays === undefined ? outline.course.accessDays : input.accessDays
	const now = ctx.now()
	const expiresAt = days ? new Date(now.getTime() + days * DAY_MS) : null
	const [existing] = await ctx.db
		.select()
		.from(enrollments)
		.where(and(eq(enrollments.memberId, input.memberId), eq(enrollments.courseId, input.courseId)))
		.orderBy(desc(enrollments.enrolledAt))
		.limit(1)
	if (existing) {
		const live =
			(existing.status === 'active' || existing.status === 'completed') &&
			(!existing.expiresAt || existing.expiresAt > now)
		if (live) return { enrollment: existing, outcome: 'already' }
		const [row] = await ctx.db
			.update(enrollments)
			.set({ status: existing.completedAt ? 'completed' : 'active', revokedAt: null, expiresAt })
			.where(eq(enrollments.id, existing.id))
			.returning()
		return { enrollment: row as Enrollment, outcome: 'restored' }
	}
	const [row] = await ctx.db
		.insert(enrollments)
		.values({
			memberId: input.memberId,
			courseId: input.courseId,
			source: input.source ?? 'manual',
			enrolledAt: now,
			expiresAt,
		})
		.returning()
	return { enrollment: row as Enrollment, outcome: 'enrolled' }
}

/** Статус с учётом срока: просроченный показывается «истёк» ещё до ночной задачи. */
const shownStatus = (now: Date) =>
	sql<
		EnrollmentRow['status']
	>`case when ${enrollments.status} in ('active', 'completed') and ${enrollments.expiresAt} is not null and ${enrollments.expiresAt} <= ${now} then 'expired' else ${enrollments.status}::text end`

const columns = (now: Date) => ({
	id: enrollments.id,
	studentName: users.name,
	studentEmail: users.email,
	status: shownStatus(now),
	source: enrollments.source,
	enrolledAt: enrollments.enrolledAt,
	expiresAt: enrollments.expiresAt,
	progressPct: enrollments.progressPct,
})

async function rowOf(ctx: SchoolCtx, id: string): Promise<EnrollmentRow> {
	const [row] = await ctx.db
		.select(columns(ctx.now()))
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(enrollments.id, id))
	return row ?? fail.notFound('ENROLLMENT_NOT_FOUND')
}

export async function listEnrollments(ctx: SchoolCtx, input: EnrollmentListQuery) {
	const now = ctx.now()
	const scope = learningScope(ctx)
	const status = shownStatus(now)
	const like = input.q ? `%${likeEscape(input.q)}%` : null
	const where = and(
		eq(enrollments.courseId, input.courseId),
		scope,
		input.filters.status ? sql`${status} = ${input.filters.status}` : undefined,
		like ? or(ilike(users.name, like), ilike(users.email, like)) : undefined,
	)
	const sort = { enrolledAt: enrollments.enrolledAt, studentName: users.name, progressPct: enrollments.progressPct }[
		input.sort
	]
	const by = input.dir === 'desc' ? desc : asc
	const [items, [total]] = await Promise.all([
		ctx.db
			.select(columns(now))
			.from(enrollments)
			.innerJoin(members, eq(members.id, enrollments.memberId))
			.innerJoin(users, eq(users.id, members.userId))
			.where(where)
			.orderBy(by(sort), asc(enrollments.id))
			.limit(input.pageSize)
			.offset((input.page - 1) * input.pageSize),
		ctx.db
			.select({ n: count() })
			.from(enrollments)
			.innerJoin(members, eq(members.id, enrollments.memberId))
			.innerJoin(users, eq(users.id, members.userId))
			.where(where),
	])
	return toPage(items, total?.n ?? 0, input)
}

/** Участник-ученик по почте или создание аккаунта (только владелец и администратор): без пароля — вход по ссылке на почту. */
async function studentByEmail(ctx: SchoolCtx, email: string, name: string | undefined) {
	const [found] = await ctx.db
		.select({ memberId: members.id, role: members.role, status: members.status, userId: users.id })
		.from(users)
		.leftJoin(members, eq(members.userId, users.id))
		.where(eq(users.email, email))
		.limit(1)
	if (found?.memberId) {
		if (found.role !== 'student') return fail.conflict('NOT_A_STUDENT')
		if (found.status === 'blocked') return fail.forbidden('MEMBER_BLOCKED')
		return found.memberId
	}
	// нет участника: аккаунт и участника создаёт владелец или администратор
	if (ctx.member.role !== 'owner' && ctx.member.role !== 'admin') return fail.forbidden('ONLY_ADMIN_CREATES_ACCOUNTS')
	let userId = found?.userId
	if (!userId) {
		const created = await auth.api.signUpEmail({
			body: { email, password: randomBytes(24).toString('base64url'), name: name ?? email.split('@')[0] ?? email },
		})
		userId = created.user.id
		// пароля у аккаунта никто не знает: ученик входит по ссылке на почту (magic link), вход подтверждает адрес
		await ctx.audit('learning.account.created', { entity: 'user', id: userId, diff: { email } })
	}
	const [member] = await ctx.db
		.insert(members)
		.values({ userId, role: 'student', invitedBy: ctx.member.id })
		.returning()
	return (member as { id: string }).id
}

/** Зачислить по почте: ученик школы — сразу; владелец и администратор — ещё и создают аккаунт; письмо «вас записали». */
export async function enrollByEmail(
	ctx: SchoolCtx,
	input: { courseId: string; email: string; accessDays?: number | undefined; name?: string | undefined },
) {
	const email = input.email.trim().toLowerCase()
	const memberId = await studentByEmail(ctx, email, input.name)
	const { enrollment, outcome } = await enroll(ctx, {
		memberId,
		courseId: input.courseId,
		source: 'manual',
		...(input.accessDays !== undefined ? { accessDays: input.accessDays } : {}),
	})
	if (outcome !== 'already') {
		const [card] = await courseCards(ctx, [input.courseId])
		await ctx.mail.send(enrolledEmail, {
			to: email,
			data: { courseTitle: card?.title ?? '', url: `${appOrigin(ctx.school.slug)}/learn/courses/${input.courseId}` },
		})
		await ctx.audit(`learning.enrollment.${outcome}`, {
			entity: 'enrollment',
			id: enrollment.id,
			diff: { courseId: input.courseId },
		})
	}
	return { outcome, enrollment: await rowOf(ctx, enrollment.id) }
}

async function ownEnrollment(ctx: SchoolCtx, id: string): Promise<Enrollment> {
	const [row] = await ctx.db.select().from(enrollments).where(eq(enrollments.id, id)).for('update')
	return row ?? fail.notFound('ENROLLMENT_NOT_FOUND')
}

/** Продлить на N дней от конца текущего срока (или от сегодня, если срок вышел или его нет); истёкшее — оживает. */
export async function extendEnrollment(ctx: SchoolCtx, input: { id: string; accessDays: number }) {
	const e = await ownEnrollment(ctx, input.id)
	if (e.status === 'revoked') return fail.conflict('ENROLLMENT_REVOKED')
	const now = ctx.now()
	const base = e.expiresAt && e.expiresAt > now ? e.expiresAt : now
	await ctx.db
		.update(enrollments)
		.set({
			expiresAt: new Date(base.getTime() + input.accessDays * DAY_MS),
			status: e.completedAt ? 'completed' : 'active',
		})
		.where(eq(enrollments.id, e.id))
	await ctx.audit('learning.enrollment.extended', { entity: 'enrollment', id: e.id, diff: { days: input.accessDays } })
	return rowOf(ctx, e.id)
}

export async function unlimitEnrollment(ctx: SchoolCtx, id: string) {
	const e = await ownEnrollment(ctx, id)
	if (e.status === 'revoked') return fail.conflict('ENROLLMENT_REVOKED')
	await ctx.db
		.update(enrollments)
		.set({ expiresAt: null, status: e.completedAt ? 'completed' : 'active' })
		.where(eq(enrollments.id, e.id))
	await ctx.audit('learning.enrollment.unlimited', { entity: 'enrollment', id: e.id })
	return rowOf(ctx, e.id)
}

/** Отозвать доступ: прогресс сохраняется, ученик курс не открывает. */
export async function revokeEnrollment(ctx: SchoolCtx, id: string) {
	const e = await ownEnrollment(ctx, id)
	if (e.status === 'revoked') return fail.conflict('ENROLLMENT_STATE', { status: e.status })
	await ctx.db.update(enrollments).set({ status: 'revoked', revokedAt: ctx.now() }).where(eq(enrollments.id, e.id))
	await ctx.audit('learning.enrollment.revoked', { entity: 'enrollment', id: e.id })
	return rowOf(ctx, e.id)
}

/** Вернуть доступ: снова действующее (или пройденное) зачисление с прежним прогрессом; просроченный срок надо продлить. */
export async function restoreEnrollment(ctx: SchoolCtx, id: string) {
	const e = await ownEnrollment(ctx, id)
	if (e.status !== 'revoked') return fail.conflict('ENROLLMENT_STATE', { status: e.status })
	await ctx.db
		.update(enrollments)
		.set({ status: e.completedAt ? 'completed' : 'active', revokedAt: null })
		.where(eq(enrollments.id, e.id))
	await ctx.audit('learning.enrollment.restored', { entity: 'enrollment', id: e.id })
	return rowOf(ctx, e.id)
}

/** Просроченные зачисления — в `expired` (ночная задача); доступ по дате ограничен и без неё. */
export async function expireDueEnrollments(ctx: BaseCtx): Promise<number> {
	const rows = await ctx.db
		.update(enrollments)
		.set({ status: 'expired' })
		.where(
			and(
				inArray(enrollments.status, ['active', 'completed']),
				sql`${enrollments.expiresAt} is not null and ${enrollments.expiresAt} <= ${ctx.now()}`,
			),
		)
		.returning({ id: enrollments.id })
	return rows.length
}
