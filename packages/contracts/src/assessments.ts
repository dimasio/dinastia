// Контракт модуля assessments (скилл api-endpoints, lms-assessments): банк вопросов курса и теги. Карточка —
// docs/tasks/phase-3-assessments/changes/3.1-question-bank.md. Данные вопроса — схема типа из реестра вопросов
// (`@dinastia/questions`), сервер проверяет ею при записи.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Id, page, pageInput } from './common/index.ts'

/** Лимиты блока «Тест» (3.3): общие для блока, редактора и сервера. */
export const QUIZ_QUESTIONS_MAX = 50
export const QUIZ_TAGS_MAX = 10
export const QUIZ_TIME_MIN_SEC = 60
export const QUIZ_TIME_MAX_SEC = 4 * 60 * 60

export const TAG_NAME_MAX = 40
export const TAGS_PER_QUESTION_MAX = 10

/** Имя тега: без лишних пробелов, 1–40 символов. */
export const TagName = z.string().trim().min(1, 'TAG_INVALID').max(TAG_NAME_MAX, 'TAG_INVALID')

/** Строка списка банка: первая строка вопроса, тип, баллы, теги. */
export const QuestionRow = z.object({
	id: Id,
	type: z.string(),
	text: z.string(),
	points: z.number().int(),
	tags: z.array(z.string()),
	createdAt: DateTime,
	updatedAt: DateTime,
})
export type QuestionRow = z.infer<typeof QuestionRow>

/** Вопрос целиком (с верными ответами) — только для сотрудников с `assessments.bank.read`. */
export const BankQuestion = z.object({
	id: Id,
	courseId: Id,
	type: z.string(),
	data: z.record(z.string(), z.unknown()),
	tags: z.array(z.string()),
})
export type BankQuestion = z.infer<typeof BankQuestion>

export const QuestionListInput = pageInput({
	sorts: ['updatedAt', 'createdAt', 'points'] as const,
	defaultSort: 'updatedAt',
	defaultDir: 'desc',
	filters: { type: z.string().max(40), tag: z.string().max(TAG_NAME_MAX) },
}).extend({ courseId: Id })
export type QuestionListQuery = z.output<typeof QuestionListInput>

export const QuestionInput = z.object({
	type: z.string().max(40),
	data: z.record(z.string(), z.unknown()),
	tags: z.array(TagName).max(TAGS_PER_QUESTION_MAX, 'TAGS_TOO_MANY').default([]),
})

export const CourseTag = z.object({ id: Id, name: z.string(), count: z.number().int() })
export type CourseTag = z.infer<typeof CourseTag>

const ById = z.object({ id: Id })

// ── Прохождение теста (карточка 3.3): namespace `quiz`, процедуры ученика ──────────────────────────────────────────
export const QUIZ_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const
export const QuizAttemptStatus = z.enum(QUIZ_ATTEMPT_STATUSES)
export const QUIZ_SHOW_CORRECT = ['never', 'after_submit', 'after_pass'] as const

export const AttemptSummary = z.object({
	id: Id,
	status: QuizAttemptStatus,
	score: z.number(),
	maxScore: z.number().int(),
	/** Сдал ли; пусто — попытка ждёт ручной проверки или ещё идёт. */
	passed: z.boolean().nullable(),
	startedAt: DateTime,
	deadlineAt: DateTime.nullable(),
	submittedAt: DateTime.nullable(),
})
export type AttemptSummary = z.infer<typeof AttemptSummary>

export const QuizState = z.object({
	settings: z.object({
		selection: z.enum(['fixed', 'random_by_tags']),
		questionsCount: z.number().int(),
		attemptsLimit: z.number().int(),
		passScorePct: z.number().int(),
		timeLimitSec: z.number().int().nullable(),
		showCorrect: z.enum(QUIZ_SHOW_CORRECT),
	}),
	attempts: z.array(AttemptSummary),
	activeAttemptId: Id.nullable(),
	canStart: z.boolean(),
	/** Лучшая попытка по доле баллов. */
	best: z.object({ score: z.number(), maxScore: z.number().int() }).nullable(),
})
export type QuizState = z.infer<typeof QuizState>

/** Вопрос попытки глазами ученика: данные — только `toPublic` снимка (верных ответов нет), порядок элементов — как в снимке. */
export const AttemptQuestion = z.object({
	id: Id,
	type: z.string(),
	points: z.number().int(),
	data: z.unknown(),
	response: z.unknown().nullable(),
})
export type AttemptQuestion = z.infer<typeof AttemptQuestion>

export const AttemptView = z.object({
	attempt: AttemptSummary,
	questions: z.array(AttemptQuestion),
	answered: z.number().int(),
})
export type AttemptView = z.infer<typeof AttemptView>

export const ResultQuestion = AttemptQuestion.extend({
	score: z.number().nullable(),
	isCorrect: z.boolean().nullable(),
	/** Разбор типа (верный ответ, пояснение). */
	review: z.unknown(),
})
export const AttemptResult = z.object({
	attempt: AttemptSummary,
	pct: z.number().int(),
	/** Показаны ли ответы и разбор по правилу `show_correct`; нет — `questions` пуст. */
	revealed: z.boolean(),
	questions: z.array(ResultQuestion),
})
export type AttemptResult = z.infer<typeof AttemptResult>

const QuizRef = z.object({ lessonId: Id, blockKey: Id })
const ByAttempt = z.object({ attemptId: Id })

export const quizContract = {
	/** Состояние теста для ученика: настройки, попытки, можно ли начать. */
	get: oc.route({ method: 'GET', path: '/quiz/{lessonId}/{blockKey}' }).input(QuizRef).output(QuizState),
	/** Начать попытку (или вернуть активную): снимок вопросов и порядка вариантов. */
	start: oc.route({ method: 'POST', path: '/quiz/{lessonId}/{blockKey}/attempts' }).input(QuizRef).output(AttemptView),
	attempt: oc.route({ method: 'GET', path: '/quiz/attempts/{attemptId}' }).input(ByAttempt).output(AttemptView),
	/** Сохранить ответ на вопрос попытки; `null` — снять ответ. После срока — ATTEMPT_EXPIRED. */
	answer: oc
		.route({ method: 'PUT', path: '/quiz/attempts/{attemptId}/answers' })
		.input(ByAttempt.extend({ attemptQuestionId: Id, response: z.unknown().nullable() }))
		.output(z.object({ ok: z.literal(true) })),
	submit: oc
		.route({ method: 'POST', path: '/quiz/attempts/{attemptId}/submit' })
		.input(ByAttempt)
		.output(AttemptResult),
	result: oc.route({ method: 'GET', path: '/quiz/attempts/{attemptId}/result' }).input(ByAttempt).output(AttemptResult),
}

export const assessmentsContract = {
	questions: {
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/questions' })
			.input(QuestionListInput)
			.output(page(QuestionRow)),
		get: oc.route({ method: 'GET', path: '/questions/{id}' }).input(ById).output(BankQuestion),
		/**
		 * Вопросы по id для выбора в тесте (3.3): каждый id — к текущей ревизии вопроса; архивного или чужого нет — `question: null`.
		 */
		lookup: oc
			.route({ method: 'POST', path: '/questions/lookup' })
			.input(z.object({ ids: z.array(Id).max(50) }))
			.output(z.array(z.object({ requestedId: Id, question: QuestionRow.nullable() }))),
		create: oc
			.route({ method: 'POST', path: '/courses/{courseId}/questions', successStatus: 201 })
			.input(QuestionInput.extend({ courseId: Id }))
			.output(BankQuestion),
		update: oc
			.route({ method: 'PATCH', path: '/questions/{id}' })
			.input(QuestionInput.omit({ type: true }).extend({ id: Id }))
			.output(BankQuestion),
		/** Убрать из банка: прежние попытки остаются, вернуть нельзя (3.1). */
		archive: oc
			.route({ method: 'POST', path: '/questions/{id}/archive' })
			.input(ById)
			.output(z.object({ ok: z.literal(true) })),
	},
	tags: {
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/question-tags' })
			.input(z.object({ courseId: Id }))
			.output(z.array(CourseTag)),
		rename: oc
			.route({ method: 'PATCH', path: '/question-tags/{id}' })
			.input(z.object({ id: Id, name: TagName }))
			.output(CourseTag),
		remove: oc
			.route({ method: 'DELETE', path: '/question-tags/{id}' })
			.input(ById)
			.output(z.object({ ok: z.literal(true) })),
	},
}
