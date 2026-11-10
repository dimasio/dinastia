// Контракт модуля courses (скилл api-endpoints, lms-courses): курсы, разделы, уроки. Карточка изменения —
// docs/tasks/phase-2-courses/changes/2.1-courses-module.md. Блоки урока — 2.3, публикация — 2.5 (2.5-publishing.md).
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Id, page, pageInput, RichText } from './common/index.ts'

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const
export const CourseStatus = z.enum(COURSE_STATUSES)
/** Режим доступа к урокам курса по умолчанию (domain.md, «Доступ к урокам»). */
export const COURSE_ACCESS_MODES = ['open', 'sequential', 'drip'] as const
/** Режим урока: `inherit` — как у курса. */
export const LESSON_ACCESS_MODES = ['inherit', 'open', 'sequential', 'drip'] as const
export const LESSON_COMPLETION_RULES = ['view', 'all_blocks', 'manual'] as const

/** Адрес курса: латиница, цифры, дефис, 3–60 символов; уникален в школе; меняется только в черновике. */
export const CourseSlug = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/, 'COURSE_SLUG_FORMAT')
	.refine((s) => !s.includes('--'), 'COURSE_SLUG_FORMAT')

/** Обложка курса: картинка школы (назначение `courses.cover`); лимиты — их же проверяет форма (2.7). */
export const COURSE_COVER = {
	purpose: 'courses.cover',
	mime: ['image/jpeg', 'image/png', 'image/webp'] as const,
	maxSize: 5 * 1024 * 1024,
}
/** Медиа урока по виду (лимиты — `BLOCK_MEDIA` в @dinastia/blocks). */
export const LESSON_MEDIA_PURPOSE = { image: 'courses.lesson-image', file: 'courses.lesson-file' } as const

export const CourseTitle = z.string().trim().min(1).max(200)
const ItemTitle = z.string().trim().min(1).max(200)

/** Строка списка курсов — без тяжёлого описания. */
export const CourseRow = z.object({
	id: Id,
	title: z.string(),
	slug: z.string(),
	status: CourseStatus,
	sectionsCount: z.number().int(),
	lessonsCount: z.number().int(),
	updatedAt: DateTime,
})
export type CourseRow = z.infer<typeof CourseRow>

export const Lesson = z.object({
	id: Id,
	courseId: Id,
	sectionId: Id,
	title: z.string(),
	position: z.number().int(),
	accessMode: z.enum(LESSON_ACCESS_MODES),
	/** «По расписанию» (4.3): через N дней от старта потока или зачисления… */
	dripDays: z.number().int().nullable(),
	/** …или с даты (`YYYY-MM-DD`, с полуночи по Москве). */
	dripDate: z.string().nullable(),
	/** Срок сдачи (4.4): через N дней от старта потока или зачисления… */
	deadlineDays: z.number().int().nullable(),
	/** …или до даты (`YYYY-MM-DD`); срок — до 23:59 по Москве. Оба пусто — без срока. */
	deadlineDate: z.string().nullable(),
	completionRule: z.enum(LESSON_COMPLETION_RULES),
	publishedAt: DateTime.nullable(),
	hasUnpublishedChanges: z.boolean(),
})
export type Lesson = z.infer<typeof Lesson>

/** Статус урока для сотрудников (2.5): черновик — ни разу не опубликован; `changed` — черновик блоков отличается. */
export type LessonStatus = 'draft' | 'published' | 'changed'
export const lessonStatus = (l: Pick<Lesson, 'publishedAt' | 'hasUnpublishedChanges'>): LessonStatus =>
	l.publishedAt === null ? 'draft' : l.hasUnpublishedChanges ? 'changed' : 'published'

export const Section = z.object({ id: Id, courseId: Id, title: z.string(), position: z.number().int() })
export const SectionWithLessons = Section.extend({ lessons: z.array(Lesson) })

/** Курс целиком: настройки, описание и дерево разделов с уроками (конструктор курса — 2.2). */
export const Course = z.object({
	id: Id,
	title: z.string(),
	slug: z.string(),
	status: CourseStatus,
	description: RichText,
	defaultAccessMode: z.enum(COURSE_ACCESS_MODES),
	accessDays: z.number().int().nullable(),
	completionThresholdPct: z.number().int(),
	/** Подписанная ссылка на обложку (час); нет обложки — null. */
	coverUrl: z.string().nullable(),
	createdAt: DateTime,
	updatedAt: DateTime,
	sections: z.array(SectionWithLessons),
})
export type Course = z.infer<typeof Course>

export const CourseCreate = z.object({
	title: CourseTitle,
	description: RichText.optional(),
	/** Не задан — из названия транслитом. */
	slug: CourseSlug.optional(),
})
export type CourseCreate = z.infer<typeof CourseCreate>

export const CourseUpdate = z.object({
	id: Id,
	title: CourseTitle.optional(),
	description: RichText.optional(),
	slug: CourseSlug.optional(),
	defaultAccessMode: z.enum(COURSE_ACCESS_MODES).optional(),
	accessDays: z.number().int().min(1).max(3650).nullable().optional(),
	completionThresholdPct: z.number().int().min(1).max(100).optional(),
	/** Загруженный файл `courses.cover`; null — убрать обложку. */
	coverFileId: Id.nullable().optional(),
})
export type CourseUpdate = z.infer<typeof CourseUpdate>

export const CourseListInput = pageInput({
	sorts: ['updatedAt', 'title', 'createdAt'] as const,
	defaultSort: 'updatedAt',
	defaultDir: 'desc',
	filters: { status: CourseStatus },
})
export type CourseListQuery = z.output<typeof CourseListInput>

const ById = z.object({ id: Id })

/** Блок урока (черновик) с полными данными — для конструктора урока; данные проверяет схема типа на сервере. */
export const LessonBlock = z.object({
	id: Id,
	blockKey: Id,
	type: z.string(),
	position: z.number().int(),
	isRequired: z.boolean(),
	data: z.record(z.string(), z.unknown()),
	/** Файлы блока по fileId — подписанные ссылки (2.7); ссылка живёт 6 ч. */
	files: z.record(
		z.string(),
		z.object({ url: z.string(), name: z.string(), mime: z.string(), size: z.number().int() }),
	),
})
export type LessonBlock = z.infer<typeof LessonBlock>

/** Урок с курсом — шапка конструктора урока. */
export const LessonWithCourse = Lesson.extend({ course: z.object({ id: Id, title: z.string(), status: CourseStatus }) })
/** Переместить в позицию `index` (0 — первым) среди соседей; урок — ещё и в другой раздел того же курса. */
const SectionMove = z.object({ id: Id, index: z.number().int().min(0) })
const LessonMove = z.object({ id: Id, sectionId: Id, index: z.number().int().min(0) })

export const coursesContract = {
	list: oc.route({ method: 'GET', path: '/courses' }).input(CourseListInput).output(page(CourseRow)),
	get: oc.route({ method: 'GET', path: '/courses/{id}' }).input(ById).output(Course),
	create: oc.route({ method: 'POST', path: '/courses', successStatus: 201 }).input(CourseCreate).output(Course),
	update: oc.route({ method: 'PATCH', path: '/courses/{id}' }).input(CourseUpdate).output(Course),
	archive: oc.route({ method: 'POST', path: '/courses/{id}/archive' }).input(ById).output(CourseRow),
	remove: oc
		.route({ method: 'DELETE', path: '/courses/{id}' })
		.input(ById)
		.output(z.object({ ok: z.literal(true) })),
	/** Черновик → опубликован; нужен опубликованный урок (COURSE_NO_PUBLISHED_LESSONS). */
	publish: oc.route({ method: 'POST', path: '/courses/{id}/publish' }).input(ById).output(Course),
	/** Опубликовать все уроки курса с изменениями — все или ни одного (COURSE_LESSONS_HAVE_ISSUES). */
	publishChanges: oc.route({ method: 'POST', path: '/courses/{id}/publish-changes' }).input(ById).output(Course),

	sections: {
		create: oc
			.route({ method: 'POST', path: '/courses/{courseId}/sections', successStatus: 201 })
			.input(z.object({ courseId: Id, title: ItemTitle }))
			.output(Section),
		rename: oc
			.route({ method: 'PATCH', path: '/sections/{id}' })
			.input(z.object({ id: Id, title: ItemTitle }))
			.output(Section),
		move: oc.route({ method: 'POST', path: '/sections/{id}/move' }).input(SectionMove).output(z.array(Section)),
		remove: oc
			.route({ method: 'DELETE', path: '/sections/{id}' })
			.input(ById)
			.output(z.object({ ok: z.literal(true) })),
	},

	lessons: {
		create: oc
			.route({ method: 'POST', path: '/sections/{sectionId}/lessons', successStatus: 201 })
			.input(z.object({ sectionId: Id, title: ItemTitle }))
			.output(Lesson),
		rename: oc
			.route({ method: 'PATCH', path: '/lessons/{id}' })
			.input(z.object({ id: Id, title: ItemTitle }))
			.output(Lesson),
		move: oc.route({ method: 'POST', path: '/lessons/{id}/move' }).input(LessonMove).output(z.array(Lesson)),
		/**
		 * Настройки урока: когда он считается пройденным (3.6) и когда открывается (4.3). Не версионируются — действуют сразу.
		 * «По расписанию» (`drip`) — нужны `dripDays` или `dripDate` (иначе `DRIP_REQUIRED`).
		 */
		update: oc
			.route({ method: 'PATCH', path: '/lessons/{id}/settings' })
			.input(
				z.object({
					id: Id,
					completionRule: z.enum(LESSON_COMPLETION_RULES).optional(),
					accessMode: z.enum(LESSON_ACCESS_MODES).optional(),
					dripDays: z.number().int().min(0).max(3650).nullable().optional(),
					dripDate: z.iso.date().nullable().optional(),
					/** Срок сдачи (4.4): задать одно из двух — другое сбрасывается; оба `null` — без срока. */
					deadlineDays: z.number().int().min(0).max(3650).nullable().optional(),
					deadlineDate: z.iso.date().nullable().optional(),
				}),
			)
			.output(Lesson),
		remove: oc
			.route({ method: 'DELETE', path: '/lessons/{id}' })
			.input(ById)
			.output(z.object({ ok: z.literal(true) })),
		get: oc.route({ method: 'GET', path: '/lessons/{id}' }).input(ById).output(LessonWithCourse),
		/** Черновик блоков → ученикам; блоки с замечаниями — LESSON_HAS_ISSUES, без блоков — LESSON_EMPTY. */
		publish: oc.route({ method: 'POST', path: '/lessons/{id}/publish' }).input(ById).output(Lesson),
	},

	/** Блоки урока — черновик (D-033); публикация — `lessons.publish`. Тип — из реестра блоков (`@dinastia/blocks`). */
	blocks: {
		list: oc
			.route({ method: 'GET', path: '/lessons/{lessonId}/blocks' })
			.input(z.object({ lessonId: Id }))
			.output(z.array(LessonBlock)),
		create: oc
			.route({ method: 'POST', path: '/lessons/{lessonId}/blocks', successStatus: 201 })
			.input(z.object({ lessonId: Id, type: z.string().max(40), index: z.number().int().min(0).optional() }))
			.output(LessonBlock),
		update: oc
			.route({ method: 'PATCH', path: '/blocks/{id}' })
			.input(z.object({ id: Id, data: z.record(z.string(), z.unknown()) }))
			.output(LessonBlock),
		move: oc
			.route({ method: 'POST', path: '/blocks/{id}/move' })
			.input(z.object({ id: Id, index: z.number().int().min(0) }))
			.output(z.array(LessonBlock)),
		/** Блок «Видео»: начать загрузку у провайдера (2.4b). Файл клиент шлёт на `uploadUrl` сам (tus); блок — `processing`. */
		startVideoUpload: oc
			.route({ method: 'POST', path: '/blocks/{id}/video-upload' })
			.input(
				z.object({
					id: Id,
					filename: z.string().min(1).max(255),
					mime: z.string().max(100),
					size: z.number().int().min(1),
				}),
			)
			.output(z.object({ uploadUrl: z.string(), block: LessonBlock })),
		/** Узнать статус обработки видео у провайдера и вернуть актуальный блок. */
		videoStatus: oc.route({ method: 'POST', path: '/blocks/{id}/video-status' }).input(ById).output(LessonBlock),
		remove: oc
			.route({ method: 'DELETE', path: '/blocks/{id}' })
			.input(ById)
			.output(z.object({ ok: z.literal(true) })),
	},
}
