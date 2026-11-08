// Таблицы модуля courses (скилл db-schema, domain.md §1 «Курсы и контент»): курс → разделы → уроки. Блоки урока —
// `lesson_blocks` (ядро, `@dinastia/db`); внешние ключи `lesson_blocks.lesson_id` и `questions.course_id` — отдельной
// миграцией модуля (D-054): таблицы ядра не могут импортировать таблицы модуля.
import {
	COURSE_ACCESS_MODES,
	COURSE_STATUSES,
	LESSON_ACCESS_MODES,
	LESSON_COMPLETION_RULES,
} from '@dinastia/contracts/courses'
import { richText, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { boolean, date, index, integer, pgEnum, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { files } from '#/kernel/storage/schema.ts'

export const courseStatus = pgEnum('course_status', COURSE_STATUSES)
export const courseAccessMode = pgEnum('course_access_mode', COURSE_ACCESS_MODES)
export const lessonAccessMode = pgEnum('lesson_access_mode', LESSON_ACCESS_MODES)
export const lessonCompletionRule = pgEnum('lesson_completion_rule', LESSON_COMPLETION_RULES)

/** Курс: в `draft` ученики не видят; `archived` — новые зачисления запрещены, у зачисленных доступ сохраняется. */
export const courses = tenantTable(
	'courses',
	{
		title: text('title').notNull(),
		/** Адрес курса в школе; меняется только в черновике. */
		slug: text('slug').notNull(),
		description: richText('description')
			.notNull()
			.default(sql`'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb`),
		status: courseStatus('status').notNull().default('draft'),
		defaultAccessMode: courseAccessMode('default_access_mode').notNull().default('open'),
		/** Срок доступа после зачисления, дней; null — без срока (фаза 4). */
		accessDays: integer('access_days'),
		/** Сколько процентов уроков пройти, чтобы курс считался пройденным (фаза 4). */
		completionThresholdPct: integer('completion_threshold_pct').notNull().default(100),
		/** Обложка — файл `courses.cover` (2.7); замена удаляет прежний файл. */
		coverFileId: uuid('cover_file_id'),
	},
	(t) => [
		uniqueIndex().on(t.schoolId, t.slug),
		index().on(t.schoolId, t.status, t.updatedAt),
		tenantRef(t, t.coverFileId, files, 'no action'),
	],
)

/** Раздел курса; порядок — `position` (шаг 1000). Удаляется вместе с уроками и их блоками. */
export const sections = tenantTable(
	'sections',
	{
		courseId: uuid('course_id').notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull(),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), index().on(t.schoolId, t.courseId, t.position)],
)

/** Урок: ровно в одном разделе своего курса; блоки — `lesson_blocks` (черновик и публикация строками, D-033). */
export const lessons = tenantTable(
	'lessons',
	{
		courseId: uuid('course_id').notNull(),
		sectionId: uuid('section_id').notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull(),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		hasUnpublishedChanges: boolean('has_unpublished_changes').notNull().default(false),
		accessMode: lessonAccessMode('access_mode').notNull().default('inherit'),
		dripDays: integer('drip_days'),
		dripDate: date('drip_date'),
		// новые уроки — «по заданиям и тестам» (3.6): без блоков-оценок это то же, что «при открытии»
		completionRule: lessonCompletionRule('completion_rule').notNull().default('all_blocks'),
	},
	(t) => [
		tenantRef(t, t.courseId, courses, 'cascade'),
		tenantRef(t, t.sectionId, sections, 'cascade'),
		index().on(t.schoolId, t.sectionId, t.position),
		index().on(t.schoolId, t.courseId),
	],
)
