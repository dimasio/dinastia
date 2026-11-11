// Состояние курса ученика при чтении (4.5, 4.6): оглавление, факты прохождения и доступ уроков — пакетно для набора зачислений
// (кабинет ученика — все его курсы, «Ученики» курса — страница списка). Доступ и сроки в БД не хранятся (D-057).
import { inArray } from 'drizzle-orm'
import type { BaseCtx } from '#/kernel/context.ts'
import { type PublishedOutline, publishedOutlines } from '../courses/service.ts'
import { computeAccess, type LessonAccess, type ProgressFact } from './access.ts'
import { type enrollments, groups, lessonProgress } from './schema.ts'

type Enrollment = typeof enrollments.$inferSelect

/** Доступ закончился: срок вышел или зачисление помечено истёкшим. */
export const isExpired = (e: Enrollment, now: Date) =>
	e.status === 'expired' || (e.expiresAt !== null && e.expiresAt <= now)

export const nextOf = (access: LessonAccess[]) =>
	access.find((a) => a.status === 'available' || a.status === 'in_progress')

export interface CourseState {
	enrollment: Enrollment
	/** null — курс снят в черновик или удалён. */
	outline: PublishedOutline | null
	facts: Map<string, ProgressFact>
	/** Доступ истёк или отозван: уроки и их названия не показываются. */
	closed: boolean
	/** Доступ к урокам; у закрытого курса — пусто. */
	access: LessonAccess[]
}

/** Состояние курсов ученика (4.5): оглавление, факты и доступ уроков — потоки и факты одной выборкой на все зачисления. */
export async function courseStates(ctx: BaseCtx, rows: Enrollment[]): Promise<CourseState[]> {
	if (!rows.length) return []
	const now = ctx.now()
	const groupIds = [...new Set(rows.flatMap((r) => (r.groupId ? [r.groupId] : [])))]
	// последовательно: запросы идут в одной транзакции (одно соединение)
	const starts = groupIds.length
		? await ctx.db.select({ id: groups.id, startsAt: groups.startsAt }).from(groups).where(inArray(groups.id, groupIds))
		: []
	const factRows = await ctx.db
		.select()
		.from(lessonProgress)
		.where(
			inArray(
				lessonProgress.enrollmentId,
				rows.map((r) => r.id),
			),
		)
	// оглавление — одно на курс (у сотрудника на странице «Учеников» все строки одного курса)
	const byCourse = await publishedOutlines(ctx, [...new Set(rows.map((r) => r.courseId))])
	const startOf = new Map(starts.map((g) => [g.id, g.startsAt]))
	const facts = new Map<string, Map<string, ProgressFact>>()
	for (const f of factRows) {
		const m = facts.get(f.enrollmentId) ?? new Map<string, ProgressFact>()
		m.set(f.lessonId, { openedAt: f.openedAt, completedAt: f.completedAt })
		facts.set(f.enrollmentId, m)
	}
	return rows.map((e) => {
		const outline = byCourse.get(e.courseId) ?? null
		const f = facts.get(e.id) ?? new Map<string, ProgressFact>()
		const closed = e.status === 'revoked' || isExpired(e, now)
		const base = { enrolledAt: e.enrolledAt, groupStartsAt: e.groupId ? (startOf.get(e.groupId) ?? null) : null }
		return {
			enrollment: e,
			outline,
			facts: f,
			closed,
			access: outline && !closed ? computeAccess(outline, base, f, now) : [],
		}
	})
}
