// Банк вопросов (D-035, скилл question-types): все типы — в общих таблицах; тип объявляет, какие колонки и виды
// элементов использует (`defineQuestion({ uses })`). Таблицы ядра: реестр вопросов, ревизии и проверка — kernel/questions.
// Курс — модуль courses (фаза 2): внешний ключ course_id → courses добавит его миграция (D-052).
import { boolean, doublePrecision, index, integer, pgEnum, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { richText } from './json.ts'
import { tenantRef, tenantTable } from './tenant.ts'

export const QUESTION_SCORING = ['all_or_nothing', 'partial'] as const
export const QUESTION_ITEM_KINDS = ['option', 'order_item', 'match_left', 'match_right', 'accepted_text'] as const

export const questionScoring = pgEnum('question_scoring', QUESTION_SCORING)
export const questionItemKind = pgEnum('question_item_kind', QUESTION_ITEM_KINDS)

/**
 * Вопрос банка курса. Правка вопроса, на который есть ответы, — новая ревизия (`revision_of` → прежняя, у прежней
 * `is_current = false`): попытки остаются со своей ревизией.
 */
export const questions = tenantTable(
	'questions',
	{
		courseId: uuid('course_id').notNull(),
		/** Тип из реестра вопросов (`defineQuestion`); после релиза не меняется. */
		type: text('type').notNull(),
		prompt: richText('prompt').notNull(),
		explanation: richText('explanation'),
		points: integer('points').notNull().default(1),
		// колонки типов (uses.columns)
		scoring: questionScoring('scoring').notNull().default('all_or_nothing'),
		caseSensitive: boolean('case_sensitive').notNull().default(false),
		numberAnswer: doublePrecision('number_answer'),
		numberTolerance: doublePrecision('number_tolerance').notNull().default(0),
		// ревизии
		revisionOf: uuid('revision_of'),
		isCurrent: boolean('is_current').notNull().default(true),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
	},
	(t) => [
		// no action, а не restrict: проверка в конце оператора — каскадное удаление школы снимает все ревизии разом
		tenantRef(t, t.revisionOf, t, 'no action'),
		index().on(t.schoolId, t.courseId, t.isCurrent),
		index().on(t.schoolId, t.revisionOf),
	],
)

/** Элемент вопроса: вариант, элемент порядка, половина пары, допустимый текст — `kind` определяет нужные колонки. */
export const questionItems = tenantTable(
	'question_items',
	{
		questionId: uuid('question_id').notNull(),
		kind: questionItemKind('kind').notNull(),
		/** Форматированный текст элемента (вариант, элемент порядка, половина пары). */
		body: richText('body'),
		/** Простой текст (допустимый ответ text_input). */
		text: text('text'),
		position: integer('position').notNull(),
		isCorrect: boolean('is_correct').notNull().default(false),
		correctPosition: integer('correct_position'),
		matchKey: text('match_key'),
	},
	(t) => [tenantRef(t, t.questionId, questions, 'cascade'), index().on(t.schoolId, t.questionId, t.kind, t.position)],
)
