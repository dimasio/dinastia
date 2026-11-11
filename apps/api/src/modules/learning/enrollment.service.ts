// Зачисление, сроки и отзыв доступа (скилл lms-learners, карточки 4.1, 4.2): зачисление по почте (и в поток), продление, отзыв
// и возврат, перевод между потоками, список учеников курса. Курс — публичный API модуля courses; аккаунты ученикам создают
// владелец и администраторы.
import { randomBytes } from 'node:crypto'
import { type EnrollmentListQuery, type EnrollmentRow, GROUP_NONE } from '@dinastia/contracts/learning'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import { auth } from '#/kernel/auth/auth.ts'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courseCards, publishedOutline } from '../courses/service.ts'
import { flatLessons } from './access.ts'
import { enrolledEmail } from './emails/enrolled.tsx'
import { groupExpiry, groupOfCourse } from './groups.service.ts'
import { inviteByEmail } from './invites.service.ts'
import { groupScope } from './policies.ts'
import { enrollments, groups, lessonProgress } from './schema.ts'
import { courseStates } from './state.ts'

type Enrollment = typeof enrollments.$inferSelect
const DAY_MS = 24 * 60 * 60 * 1000
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/** Область списка учеников: куратор — только ученики своих потоков (`groupScope`), остальные — вся школа (RLS). */
export function learningScope(ctx: SchoolCtx): SQL | undefined {
	return groupScope(ctx)
}

export type EnrollOutcome = 'enrolled' | 'restored' | 'already'

/**
 * Зачислить участника на курс (внутренняя функция и основа `enrollByEmail`). Опубликованный курс; срок — `accessDays`
 * (не указан — срок потока, затем срок курса по умолчанию; `null` — без срока). Действующее зачисление возвращается как есть
 * (`already`; указан поток — переводится в него); отозванное и истёкшее — возвращаются с прежним прогрессом и новым сроком
 * (`restored`). Поток — этого курса, иначе GROUP_NOT_FOUND; не указан — поток зачисления не меняется.
 */
export async function enroll(
	ctx: BaseCtx,
	input: {
		memberId: string
		courseId: string
		source?: Enrollment['source']
		accessDays?: number | null
		inviteId?: string
		groupId?: string | null
	},
): Promise<{ enrollment: Enrollment; outcome: EnrollOutcome }> {
	const outline = await publishedOutline(ctx, input.courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	if (outline.course.status !== 'published') return fail.conflict('COURSE_NOT_PUBLISHED')
	const group = input.groupId ? await groupOfCourse(ctx, input.groupId, input.courseId) : null
	const now = ctx.now()
	const days = input.accessDays === undefined ? outline.course.accessDays : input.accessDays
	const expiresAt =
		(input.accessDays === undefined ? groupExpiry(group, now) : undefined) ??
		(days ? new Date(now.getTime() + days * DAY_MS) : null)
	const groupPatch = group ? { groupId: group.id } : {}
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
		if (live) {
			if (!group || existing.groupId === group.id) return { enrollment: existing, outcome: 'already' }
			const [moved] = await ctx.db
				.update(enrollments)
				.set(groupPatch)
				.where(eq(enrollments.id, existing.id))
				.returning()
			return { enrollment: moved as Enrollment, outcome: 'already' }
		}
		const [row] = await ctx.db
			.update(enrollments)
			.set({
				status: existing.completedAt ? 'completed' : 'active',
				revokedAt: null,
				expiresAt,
				...(input.inviteId ? { inviteId: input.inviteId } : {}),
				...groupPatch,
			})
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
			inviteId: input.inviteId ?? null,
			groupId: group?.id ?? null,
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
	groupId: enrollments.groupId,
	groupTitle: groups.title,
})
type BaseRow = Omit<EnrollmentRow, 'lessonsCompleted' | 'lessonsTotal' | 'overdueCount' | 'lastActivityAt'>

/** Последнее открытие или завершение урока (подзапрос для сортировки; RLS — как у запроса). */
const lastActivity = sql`(select max(greatest(${lessonProgress.openedAt}, coalesce(${lessonProgress.completedAt}, ${lessonProgress.openedAt}))) from ${lessonProgress} where ${lessonProgress.enrollmentId} = ${enrollments.id})`

/**
 * Пройдено уроков, просрочки и последняя активность (4.6) — из `courseStates` по строкам страницы: доступ и сроки считаются
 * при чтении, как у ученика.
 */
export async function withProgress<T extends BaseRow>(ctx: BaseCtx, rows: T[]): Promise<(T & EnrollmentRow)[]> {
	if (!rows.length) return []
	const full = await ctx.db
		.select()
		.from(enrollments)
		.where(
			inArray(
				enrollments.id,
				rows.map((r) => r.id),
			),
		)
	const states = new Map((await courseStates(ctx, full)).map((s) => [s.enrollment.id, s]))
	return rows.map((r) => {
		const s = states.get(r.id)
		const ids = s?.outline ? flatLessons(s.outline).map((l) => l.id) : []
		let last: Date | null = null
		for (const f of s?.facts.values() ?? []) {
			const at = f.completedAt && f.completedAt > f.openedAt ? f.completedAt : f.openedAt
			if (!last || at > last) last = at
		}
		return {
			...r,
			lessonsCompleted: ids.filter((id) => s?.facts.get(id)?.completedAt).length,
			lessonsTotal: ids.length,
			overdueCount: s?.access.filter((a) => a.overdue).length ?? 0,
			lastActivityAt: last,
		}
	})
}

async function rowOf(ctx: SchoolCtx, id: string): Promise<EnrollmentRow> {
	const [row] = await ctx.db
		.select(columns(ctx.now()))
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.leftJoin(groups, eq(groups.id, enrollments.groupId))
		.where(and(eq(enrollments.id, id), learningScope(ctx)))
	if (!row) return fail.notFound('ENROLLMENT_NOT_FOUND')
	return (await withProgress(ctx, [row]))[0] as EnrollmentRow
}

/** Фильтры списка учеников курса — общие для экрана и выгрузки (4.6). */
export interface EnrollmentFilters {
	courseId: string
	q?: string | undefined
	status?: EnrollmentRow['status'] | undefined
	groupId?: string | undefined
}

export function enrollmentsWhere(scope: SQL | undefined, f: EnrollmentFilters, now: Date) {
	const like = f.q ? `%${likeEscape(f.q)}%` : null
	return and(
		eq(enrollments.courseId, f.courseId),
		scope,
		f.status ? sql`${shownStatus(now)} = ${f.status}` : undefined,
		f.groupId === GROUP_NONE ? isNull(enrollments.groupId) : f.groupId ? eq(enrollments.groupId, f.groupId) : undefined,
		like ? or(ilike(users.name, like), ilike(users.email, like)) : undefined,
	)
}

/** Строки учеников с соединениями (имя, почта, поток) — для экрана и выгрузки. */
export const enrollmentRowsQuery = (ctx: BaseCtx, where: SQL | undefined) =>
	ctx.db
		.select(columns(ctx.now()))
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.leftJoin(groups, eq(groups.id, enrollments.groupId))
		.where(where)

export async function listEnrollments(ctx: SchoolCtx, input: EnrollmentListQuery) {
	const now = ctx.now()
	const where = enrollmentsWhere(learningScope(ctx), { courseId: input.courseId, q: input.q, ...input.filters }, now)
	const by = input.dir === 'desc' ? desc : asc
	const order =
		input.sort === 'lastActivityAt'
			? sql`${lastActivity} ${input.dir === 'desc' ? sql`desc nulls last` : sql`asc nulls first`}`
			: by(
					{ enrolledAt: enrollments.enrolledAt, studentName: users.name, progressPct: enrollments.progressPct }[
						input.sort
					],
				)
	const items = await enrollmentRowsQuery(ctx, where)
		.orderBy(order, asc(enrollments.id))
		.limit(input.pageSize)
		.offset((input.page - 1) * input.pageSize)
	const [total] = await ctx.db
		.select({ n: count() })
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(where)
	return toPage(await withProgress(ctx, items), total?.n ?? 0, input)
}

/**
 * Участник-ученик по почте или создание аккаунта (только владелец и администратор): без пароля — вход по ссылке на почту.
 * Нет участника, а смотрит преподаватель — `null`: ему остаётся приглашение на почту.
 */
async function studentByEmail(ctx: SchoolCtx, email: string, name: string | undefined): Promise<string | null> {
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
	if (ctx.member.role !== 'owner' && ctx.member.role !== 'admin') return null
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
	input: {
		courseId: string
		email: string
		accessDays?: number | undefined
		name?: string | undefined
		groupId?: string | undefined
	},
) {
	const email = input.email.trim().toLowerCase()
	// поток проверяется до создания аккаунта и приглашения
	if (input.groupId) await groupOfCourse(ctx, input.groupId, input.courseId)
	const memberId = await studentByEmail(ctx, email, input.name)
	if (!memberId) {
		await inviteByEmail(ctx, { courseId: input.courseId, email, groupId: input.groupId })
		return { outcome: 'invited' as const, enrollment: null }
	}
	const { enrollment, outcome } = await enroll(ctx, {
		memberId,
		courseId: input.courseId,
		source: 'manual',
		...(input.accessDays !== undefined ? { accessDays: input.accessDays } : {}),
		...(input.groupId ? { groupId: input.groupId } : {}),
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

/** Перевести в поток курса или убрать из потока: срок и прогресс не меняются (4.2). */
export async function moveEnrollment(ctx: SchoolCtx, input: { id: string; groupId: string | null }) {
	const e = await ownEnrollment(ctx, input.id)
	const group = input.groupId ? await groupOfCourse(ctx, input.groupId, e.courseId) : null
	if ((group?.id ?? null) !== e.groupId) {
		await ctx.db
			.update(enrollments)
			.set({ groupId: group?.id ?? null })
			.where(eq(enrollments.id, e.id))
		await ctx.audit('learning.enrollment.moved', {
			entity: 'enrollment',
			id: e.id,
			diff: { from: e.groupId, to: group?.id ?? null },
		})
	}
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
