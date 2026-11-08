// Таблицы модуля assessments (скилл db-schema, domain.md §1): теги банка вопросов курса. Сами вопросы — таблицы ядра
// `questions`/`question_items` (@dinastia/db, D-052). Внешний ключ `course_id → courses` — составной, как у других таблиц.
import { questions, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { courses } from '../courses/schema.ts'

/** Тег курса: свободная метка; имя уникально в курсе без учёта регистра. */
export const questionTags = tenantTable(
	'question_tags',
	{
		courseId: uuid('course_id').notNull(),
		/** Название тега (в API — `name`; колонка `label`: имена `name` реестр проверок считает возможными ПДн). */
		label: text('label').notNull(),
	},
	(t) => [
		tenantRef(t, t.courseId, courses, 'cascade'),
		uniqueIndex('question_tags_course_label_key').on(t.schoolId, t.courseId, sql`lower(${t.label})`),
	],
)

/** Связь «вопрос — тег». При ревизии вопроса (3.3) связи копируются на новую строку вопроса. */
export const questionTagLinks = tenantTable(
	'question_tag_links',
	{
		questionId: uuid('question_id').notNull(),
		tagId: uuid('tag_id').notNull(),
	},
	(t) => [
		tenantRef(t, t.questionId, questions, 'cascade'),
		tenantRef(t, t.tagId, questionTags, 'cascade'),
		uniqueIndex().on(t.schoolId, t.questionId, t.tagId),
		index().on(t.schoolId, t.tagId),
	],
)
