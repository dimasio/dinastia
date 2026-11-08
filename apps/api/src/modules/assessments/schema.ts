// Таблицы модуля assessments (скилл db-schema, domain.md §1): теги банка вопросов курса. Сами вопросы — таблицы ядра
// `questions`/`question_items` (@dinastia/db, D-052). Внешний ключ `course_id → courses` — составной, как у других таблиц.
import { questionItems, questions, richText, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgEnum,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core'
import { members } from '#/kernel/members/schema.ts'
import { files } from '#/kernel/storage/schema.ts'
import { courses, lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'

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

export const QUIZ_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const
export const quizAttemptStatus = pgEnum('quiz_attempt_status', QUIZ_ATTEMPT_STATUSES)

/**
 * Попытка прохождения теста (карточка 3.3). `block_key` — стабильный ключ блока между версиями урока. `submitted` —
 * отправлена, ждёт ручной проверки (`open_text`, 3.6); `graded` — оценена, `passed` известен.
 */
export const quizAttempts = tenantTable(
	'quiz_attempts',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		blockKey: uuid('block_key').notNull(),
		status: quizAttemptStatus('status').notNull().default('in_progress'),
		/** Баллы автоматической проверки (с долями при частичном начислении). */
		score: doublePrecision('score').notNull().default(0),
		maxScore: integer('max_score').notNull().default(0),
		passed: boolean('passed'),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		/** Срок по серверным часам: `started_at + time_limit_sec`; без лимита времени — пусто. */
		deadlineAt: timestamp('deadline_at', { withTimezone: true }),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		gradedAt: timestamp('graded_at', { withTimezone: true }),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		index().on(t.schoolId, t.enrollmentId, t.lessonId, t.blockKey),
		index().on(t.schoolId, t.status, t.deadlineAt),
	],
)

/** Снимок вопроса попытки: конкретная ревизия и баллы на момент старта. */
export const attemptQuestions = tenantTable(
	'attempt_questions',
	{
		attemptId: uuid('attempt_id').notNull(),
		questionId: uuid('question_id').notNull(),
		position: integer('position').notNull(),
		points: integer('points').notNull(),
	},
	(t) => [
		tenantRef(t, t.attemptId, quizAttempts, 'cascade'),
		tenantRef(t, t.questionId, questions, 'no action'),
		uniqueIndex().on(t.schoolId, t.attemptId, t.position),
		index().on(t.schoolId, t.questionId),
	],
)

/** Порядок элементов вопроса в попытке (перемешивание фиксируется при старте). */
export const attemptQuestionItems = tenantTable(
	'attempt_question_items',
	{
		attemptQuestionId: uuid('attempt_question_id').notNull(),
		itemId: uuid('item_id').notNull(),
		position: integer('position').notNull(),
	},
	(t) => [
		tenantRef(t, t.attemptQuestionId, attemptQuestions, 'cascade'),
		tenantRef(t, t.itemId, questionItems, 'no action'),
		uniqueIndex().on(t.schoolId, t.attemptQuestionId, t.itemId),
	],
)

/** Ответ ученика на вопрос попытки: текст, число и оценка; выбранное, порядок и пары — `quiz_answer_items`. */
export const quizAnswers = tenantTable(
	'quiz_answers',
	{
		attemptQuestionId: uuid('attempt_question_id').notNull(),
		textValue: text('text_value'),
		numberValue: doublePrecision('number_value'),
		/** Баллы за вопрос; пусто — ещё не оценён (ручная проверка). */
		score: doublePrecision('score'),
		isCorrect: boolean('is_correct'),
		answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
		/** Ручная оценка (`open_text`, 3.6): кто поставил и комментарий проверяющего. */
		gradedByMemberId: uuid('graded_by_member_id'),
		feedback: richText('feedback'),
	},
	(t) => [
		tenantRef(t, t.attemptQuestionId, attemptQuestions, 'cascade'),
		tenantRef(t, t.gradedByMemberId, members, 'no action'),
		uniqueIndex().on(t.schoolId, t.attemptQuestionId),
	],
)

/** Выбранный вариант, элемент порядка (`position`) или пара (`item_id` → `matched_item_id`). */
export const quizAnswerItems = tenantTable(
	'quiz_answer_items',
	{
		answerId: uuid('answer_id').notNull(),
		itemId: uuid('item_id').notNull(),
		position: integer('position'),
		matchedItemId: uuid('matched_item_id'),
	},
	(t) => [
		tenantRef(t, t.answerId, quizAnswers, 'cascade'),
		tenantRef(t, t.itemId, questionItems, 'no action'),
		index().on(t.schoolId, t.answerId),
	],
)

export const SUBMISSION_STATUSES = ['draft', 'submitted', 'needs_revision', 'accepted', 'rejected'] as const
export const submissionStatus = pgEnum('submission_status', SUBMISSION_STATUSES)

/**
 * Сдача домашнего задания (карточка 3.4): одна запись на `(зачисление, урок, block_key)`; `revision` растёт при каждой
 * отправке. Переходы статусов — только через `transition` (`transitions.ts`).
 */
export const submissions = tenantTable(
	'submissions',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		blockKey: uuid('block_key').notNull(),
		status: submissionStatus('status').notNull().default('draft'),
		body: richText('body'),
		revision: integer('revision').notNull().default(0),
		reviewerMemberId: uuid('reviewer_member_id'),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		tenantRef(t, t.reviewerMemberId, members, 'no action'),
		uniqueIndex().on(t.schoolId, t.enrollmentId, t.lessonId, t.blockKey),
		index().on(t.schoolId, t.status, t.submittedAt),
	],
)

/** Файлы сдачи (назначение `assessments.submission-file`); порядок — `position`. */
export const submissionFiles = tenantTable(
	'submission_files',
	{
		submissionId: uuid('submission_id').notNull(),
		fileId: uuid('file_id').notNull(),
		position: integer('position').notNull(),
	},
	(t) => [
		tenantRef(t, t.submissionId, submissions, 'cascade'),
		tenantRef(t, t.fileId, files, 'no action'),
		uniqueIndex().on(t.schoolId, t.submissionId, t.fileId),
	],
)

/** Комментарий проверяющего к сдаче (виден ученику); ответы ученика и файлы к комментариям — 3.5. */
export const submissionComments = tenantTable(
	'submission_comments',
	{
		submissionId: uuid('submission_id').notNull(),
		authorMemberId: uuid('author_member_id').notNull(),
		body: richText('body').notNull(),
	},
	(t) => [
		tenantRef(t, t.submissionId, submissions, 'cascade'),
		tenantRef(t, t.authorMemberId, members, 'no action'),
		index().on(t.schoolId, t.submissionId, t.createdAt),
	],
)

/** Файлы комментария (назначение `assessments.comment-file`); порядок — `position`. */
export const submissionCommentFiles = tenantTable(
	'submission_comment_files',
	{
		commentId: uuid('comment_id').notNull(),
		fileId: uuid('file_id').notNull(),
		position: integer('position').notNull(),
	},
	(t) => [
		tenantRef(t, t.commentId, submissionComments, 'cascade'),
		tenantRef(t, t.fileId, files, 'no action'),
		uniqueIndex().on(t.schoolId, t.commentId, t.fileId),
	],
)
