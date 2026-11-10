// Доступность уроков ученику (domain.md §3 «Доступ к урокам», карточки 2.6, 4.3): считается при чтении из зачисления,
// старта потока, порядка опубликованных уроков и завершённости — в БД не хранится. Чистые функции: тестируются без БД.
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

/** «С даты» — с полуночи по Москве (часовой пояс школы как настройка — позже, 4.3). */
export const dripDateStart = (date: string) => new Date(`${date}T00:00:00+03:00`)

/** Урок по порядку курса: разделы, затем уроки в них. */
export const flatLessons = (outline: PublishedOutline) => outline.sections.flatMap((s) => s.lessons)

export function computeAccess(
	outline: PublishedOutline,
	/** `groupStartsAt` — старт потока ученика: «через N дней» считается от него, иначе от зачисления (4.3). */
	enrollment: { enrolledAt: Date; groupStartsAt?: Date | null },
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
			const from = enrollment.groupStartsAt ?? enrollment.enrolledAt
			const opensAt = lesson.dripDate
				? dripDateStart(lesson.dripDate)
				: lesson.dripDays !== null
					? new Date(from.getTime() + lesson.dripDays * DAY_MS)
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
