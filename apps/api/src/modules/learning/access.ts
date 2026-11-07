// Доступность уроков ученику (domain.md §3 «Доступ к урокам», карточка 2.6): считается при чтении из зачисления,
// порядка опубликованных уроков и завершённости — в БД не хранится. Чистые функции: тестируются без БД.
import type { PublishedOutline } from '../courses/service.ts'

export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'

/** Чем закрыт урок: другим уроком (последовательно) или датой (по расписанию). */
export type LockedBy = { kind: 'lesson'; lessonId: string; title: string } | { kind: 'date'; at: Date }

export interface LessonAccess {
	lessonId: string
	status: LessonStatus
	lockedBy: LockedBy | null
}

export interface ProgressFact {
	openedAt: Date
	completedAt: Date | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Урок по порядку курса: разделы, затем уроки в них. */
export const flatLessons = (outline: PublishedOutline) => outline.sections.flatMap((s) => s.lessons)

export function computeAccess(
	outline: PublishedOutline,
	enrollment: { enrolledAt: Date },
	progress: ReadonlyMap<string, ProgressFact>,
	now: Date,
): LessonAccess[] {
	const lessons = flatLessons(outline)
	return lessons.map((lesson, i) => {
		const fact = progress.get(lesson.id)
		const mode = lesson.accessMode === 'inherit' ? outline.course.defaultAccessMode : lesson.accessMode
		let lockedBy: LockedBy | null = null
		const prev = lessons[i - 1]
		if (mode === 'sequential' && prev && !progress.get(prev.id)?.completedAt)
			lockedBy = { kind: 'lesson', lessonId: prev.id, title: prev.title }
		if (mode === 'drip') {
			const opensAt = lesson.dripDate
				? new Date(`${lesson.dripDate}T00:00:00.000Z`)
				: lesson.dripDays !== null
					? new Date(enrollment.enrolledAt.getTime() + lesson.dripDays * DAY_MS)
					: null
			if (opensAt && now < opensAt) lockedBy = { kind: 'date', at: opensAt }
		}
		const status: LessonStatus = fact?.completedAt
			? 'completed'
			: lockedBy
				? 'locked'
				: fact
					? 'in_progress'
					: 'available'
		return { lessonId: lesson.id, status, lockedBy }
	})
}
