import { blockChildTable, blockTable } from '@dinastia/db'
import { boolean, index, integer, text, uuid } from 'drizzle-orm/pg-core'

/**
 * block_quiz: настройки теста (скилл lesson-blocks, карточка 3.3). Вопросы — дочерняя таблица `block_quiz_questions`
 * (фиксированный список), теги — `block_quiz_tags` (случайные по тегам). Ключи на `questions` и `question_tags` — ручной
 * миграцией (D-054): таблицы ядра и модуля `assessments` блокам недоступны.
 */
export const blockQuiz = blockTable('quiz', {
	selection: text('selection').notNull().default('fixed'),
	randomCount: integer('random_count').notNull().default(5),
	attemptsLimit: integer('attempts_limit').notNull().default(0),
	passScorePct: integer('pass_score_pct').notNull().default(60),
	timeLimitSec: integer('time_limit_sec'),
	shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
	shuffleOptions: boolean('shuffle_options').notNull().default(false),
	showCorrect: text('show_correct').notNull().default('after_submit'),
})

export const blockQuizQuestions = blockChildTable(
	blockQuiz,
	'questions',
	{ questionId: uuid('question_id').notNull() },
	(t) => [index().on(t.schoolId, t.questionId)],
)

export const blockQuizTags = blockChildTable(blockQuiz, 'tags', { tagId: uuid('tag_id').notNull() }, (t) => [
	index().on(t.schoolId, t.tagId),
])
