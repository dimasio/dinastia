// Контракт модуля learning (скилл api-endpoints, lms-learners): область ученика `learn.*` — свои курсы, оглавление,
// урок и отметки прохождения. Карточка — docs/tasks/phase-2-courses/changes/2.6-player.md.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Id } from './common/index.ts'
import { LESSON_COMPLETION_RULES } from './courses.ts'

export const LESSON_STATUSES = ['locked', 'available', 'in_progress', 'completed'] as const
export const LessonStatus = z.enum(LESSON_STATUSES)

/** Чем закрыт урок: другим уроком (последовательно) или датой (по расписанию). */
export const LockedBy = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('lesson'), lessonId: Id, title: z.string() }),
	z.object({ kind: z.literal('date'), at: DateTime }),
])
export type LockedBy = z.infer<typeof LockedBy>

/** Курс ученика в списке «Мои курсы». */
export const MyCourse = z.object({
	id: Id,
	title: z.string(),
	slug: z.string(),
	coverUrl: z.string().nullable(),
	progressPct: z.number().int().min(0).max(100),
	/** Доступ закончился (срок вышел) — курс виден, уроки закрыты. */
	expired: z.boolean(),
})
export type MyCourse = z.infer<typeof MyCourse>

export const OutlineLesson = z.object({
	id: Id,
	title: z.string(),
	status: LessonStatus,
	lockedBy: LockedBy.nullable(),
})
export const CourseOutline = z.object({
	course: MyCourse,
	sections: z.array(z.object({ id: Id, title: z.string(), lessons: z.array(OutlineLesson) })),
	/** Куда вести «Продолжить»: первый незавершённый доступный урок; null — всё пройдено или нечего открывать. */
	nextLessonId: Id.nullable(),
})
export type CourseOutline = z.infer<typeof CourseOutline>

/** Блок урока глазами ученика — данные только через `toPublic` типа; файлы — подписанные ссылки. */
export const PlayerBlock = z.object({
	id: Id,
	blockKey: Id,
	type: z.string(),
	isRequired: z.boolean(),
	data: z.unknown(),
	files: z.record(
		z.string(),
		z.object({ url: z.string(), name: z.string(), mime: z.string(), size: z.number().int() }),
	),
})
export type PlayerBlock = z.infer<typeof PlayerBlock>

const NavLesson = z.object({ id: Id, title: z.string(), locked: z.boolean() })

export const PlayerLesson = z.object({
	lesson: z.object({
		id: Id,
		courseId: Id,
		courseTitle: z.string(),
		title: z.string(),
		completionRule: z.enum(LESSON_COMPLETION_RULES),
		status: LessonStatus,
	}),
	blocks: z.array(PlayerBlock),
	prev: NavLesson.nullable(),
	next: NavLesson.nullable(),
})
export type PlayerLesson = z.infer<typeof PlayerLesson>

const LessonById = z.object({ lessonId: Id })
const LessonState = z.object({ status: LessonStatus, progressPct: z.number().int().min(0).max(100) })

export const learnContract = {
	courses: {
		list: oc.route({ method: 'GET', path: '/learn/courses' }).output(z.array(MyCourse)),
		get: oc
			.route({ method: 'GET', path: '/learn/courses/{courseId}' })
			.input(z.object({ courseId: Id }))
			.output(CourseOutline),
	},
	lessons: {
		/** Закрытый урок — `LESSON_LOCKED` (с `lockedBy`); чужой, неопубликованный, без зачисления — `LESSON_NOT_FOUND`. */
		get: oc.route({ method: 'GET', path: '/learn/lessons/{lessonId}' }).input(LessonById).output(PlayerLesson),
		/** Ученик открыл урок; по правилу `view` урок сразу завершён. */
		open: oc.route({ method: 'POST', path: '/learn/lessons/{lessonId}/open' }).input(LessonById).output(LessonState),
		/** Завершить урок (кнопка при правиле `manual`); повтор — без изменений. */
		complete: oc
			.route({ method: 'POST', path: '/learn/lessons/{lessonId}/complete' })
			.input(LessonById)
			.output(LessonState),
	},
}
