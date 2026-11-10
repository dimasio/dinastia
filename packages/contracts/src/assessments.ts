// Контракт модуля assessments (скилл api-endpoints, lms-assessments): банк вопросов курса и теги. Карточка —
// docs/tasks/phase-3-assessments/changes/3.1-question-bank.md. Данные вопроса — схема типа из реестра вопросов
// (`@dinastia/questions`), сервер проверяет ею при записи.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { CommentText, DateTime, Id, page, pageInput, RichText } from './common/index.ts'

/** Лимиты блока «Тест» (3.3): общие для блока, редактора и сервера. */
export const QUIZ_QUESTIONS_MAX = 50
export const QUIZ_TAGS_MAX = 10
export const QUIZ_TIME_MIN_SEC = 60
export const QUIZ_TIME_MAX_SEC = 4 * 60 * 60

/** Домашнее задание (3.4): файлов в сдаче и назначение файла сдачи (лимиты — их же проверяет форма). */
export const ASSIGNMENT_MAX_FILES = 10
export const SUBMISSION_FILE = {
	purpose: 'assessments.submission-file',
	maxSize: 100 * 1024 * 1024,
	mime: [
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif',
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-powerpoint',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/zip',
		'text/plain',
		'text/csv',
		'audio/mpeg',
		'video/mp4',
	] as const,
}

/** Файлы комментария в переписке по работе (3.5): до 3, те же типы и лимит, что у файлов сдачи. */
export const COMMENT_FILES_MAX = 3
export const COMMENT_FILE = {
	purpose: 'assessments.comment-file',
	maxSize: SUBMISSION_FILE.maxSize,
	mime: SUBMISSION_FILE.mime,
}

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
	/** Комментарий проверяющего к ручной оценке (3.6). */
	feedback: CommentText.nullable(),
})

/** Вопрос с ручной проверкой (`open_text`) и его оценка — видны ученику всегда, независимо от правила показа ответов. */
export const ManualResult = AttemptQuestion.extend({ score: z.number().nullable(), feedback: CommentText.nullable() })
export const AttemptResult = z.object({
	attempt: AttemptSummary,
	pct: z.number().int(),
	/** Показаны ли ответы и разбор по правилу `show_correct`; нет — `questions` пуст. */
	revealed: z.boolean(),
	questions: z.array(ResultQuestion),
	/** Вопросы с ручной проверкой: ответ, баллы и комментарий проверяющего (3.6). */
	manual: z.array(ManualResult),
})
export type AttemptResult = z.infer<typeof AttemptResult>

const QuizRef = z.object({ lessonId: Id, blockKey: Id })

// ── Домашнее задание (карточка 3.4): namespace `assignment` ───────────────────────────────────────────────────────
export const SUBMISSION_STATUSES = ['draft', 'submitted', 'needs_revision', 'accepted', 'rejected'] as const
export const SubmissionStatus = z.enum(SUBMISSION_STATUSES)
export const SUBMISSION_TEXT_MAX = 10_000

const FileRef = z.object({ id: Id, name: z.string(), mime: z.string(), size: z.number().int(), url: z.string() })

export const SubmissionComment = z.object({
	id: Id,
	authorName: z.string(),
	/** Роль автора в школе: проверяющий или ученик. */
	authorRole: z.enum(['owner', 'admin', 'teacher', 'curator', 'student']),
	body: CommentText,
	files: z.array(FileRef),
	createdAt: DateTime,
})

export const Submission = z.object({
	id: Id,
	status: SubmissionStatus,
	body: CommentText.nullable(),
	files: z.array(FileRef),
	comments: z.array(SubmissionComment),
	/** Сколько раз отправлено (0 — черновик ни разу не отправлялся). */
	revision: z.number().int(),
	submittedAt: DateTime.nullable(),
	reviewedAt: DateTime.nullable(),
})
export type Submission = z.infer<typeof Submission>

export const AssignmentState = z.object({
	settings: z.object({
		prompt: RichText,
		allowText: z.boolean(),
		allowFiles: z.boolean(),
		maxFiles: z.number().int(),
		requiresReview: z.boolean(),
	}),
	/** Файлы в формулировке (картинки): подписанные ссылки. */
	promptFiles: z.record(
		z.string(),
		z.object({ url: z.string(), name: z.string(), mime: z.string(), size: z.number().int() }),
	),
	/** Сдача ученика; пусто — ещё не начинал. */
	submission: Submission.nullable(),
	/** Можно ли править и отправлять (нет сдачи, черновик или «нужна доработка»). */
	canEdit: z.boolean(),
})
export type AssignmentState = z.infer<typeof AssignmentState>

const Answer = z.object({ body: CommentText.nullable(), fileIds: z.array(Id).max(ASSIGNMENT_MAX_FILES) })
const Reply = z.object({ body: CommentText.nullable(), fileIds: z.array(Id).max(COMMENT_FILES_MAX) })

/** `allow_resubmit` — разрешить пересдачу отклонённой работы (4.3): «Отклонена» → «Нужна доработка». */
export const REVIEW_DECISIONS = ['accept', 'needs_revision', 'reject', 'allow_resubmit'] as const

export const assignmentContract = {
	get: oc.route({ method: 'GET', path: '/assignment/{lessonId}/{blockKey}' }).input(QuizRef).output(AssignmentState),
	/** Сохранить черновик (или доработку): текст и файлы заменяются присланными. */
	saveDraft: oc
		.route({ method: 'PUT', path: '/assignment/{lessonId}/{blockKey}/draft' })
		.input(QuizRef.extend(Answer.shape))
		.output(AssignmentState),
	/** Сохранить и отправить; при `requires_review = false` работа сразу принимается. */
	submit: oc
		.route({ method: 'POST', path: '/assignment/{lessonId}/{blockKey}/submit' })
		.input(QuizRef.extend(Answer.shape))
		.output(AssignmentState),
	/** Ответ ученика в переписке (пока работа «на проверке» или «нужна доработка»); статус не меняется. */
	reply: oc
		.route({ method: 'POST', path: '/assignment/{lessonId}/{blockKey}/reply' })
		.input(QuizRef.extend(Reply.shape))
		.output(AssignmentState),
	/**
	 * Проверка работы: принять, вернуть на доработку, отклонить или разрешить пересдачу отклонённой (4.3); кроме «принять» —
	 * с комментарием.
	 */
	review: oc
		.route({ method: 'POST', path: '/assignment/submissions/{submissionId}/review' })
		.input(
			z.object({
				submissionId: Id,
				decision: z.enum(REVIEW_DECISIONS),
				comment: CommentText.nullable(),
				/** Файлы к комментарию решения (до 3). */
				fileIds: z.array(Id).max(COMMENT_FILES_MAX).default([]),
			}),
		)
		.output(z.object({ id: Id, status: SubmissionStatus })),
}
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

// ── Очередь проверки (карточка 3.5): namespace `review`, процедуры проверяющего ───────────────────────────────────────
export const REVIEW_KINDS = ['assignment', 'quiz'] as const
export const REVIEW_STATUSES = ['submitted', 'needs_revision', 'accepted', 'rejected', 'graded'] as const
export const ReviewStatus = z.enum(REVIEW_STATUSES)

export const ReviewRow = z.object({
	id: Id,
	/** Вид строки очереди: работа по заданию или попытка теста с ручной проверкой. */
	kind: z.enum(REVIEW_KINDS),
	studentName: z.string(),
	studentEmail: z.string(),
	courseId: Id,
	courseTitle: z.string(),
	lessonTitle: z.string(),
	/** Задание — статус сдачи; тест — `submitted` (ждёт проверки) или `graded` (оценён). */
	status: ReviewStatus,
	/** Номер отправки (задание) или попытки (тест). */
	revision: z.number().int(),
	submittedAt: DateTime.nullable(),
})
export type ReviewRow = z.infer<typeof ReviewRow>

export const ReviewListInput = pageInput({
	sorts: ['submittedAt'] as const,
	defaultSort: 'submittedAt',
	defaultDir: 'asc',
	filters: { status: ReviewStatus, courseId: Id, kind: z.enum(REVIEW_KINDS) },
})
export type ReviewListQuery = z.output<typeof ReviewListInput>

export const ReviewDetail = z.object({
	submission: Submission,
	student: z.object({ name: z.string(), email: z.string() }),
	course: z.object({ id: Id, title: z.string() }),
	lesson: z.object({ id: Id, title: z.string() }),
	/** Формулировка задания (опубликованная версия); блок могли убрать из урока — тогда пусто. */
	prompt: RichText.nullable(),
	promptFiles: z.record(
		z.string(),
		z.object({ url: z.string(), name: z.string(), mime: z.string(), size: z.number().int() }),
	),
})
export type ReviewDetail = z.infer<typeof ReviewDetail>

/** Попытка теста на ручную проверку (3.6): ответы целиком, ручные вопросы с оценкой. */
export const AttemptReview = z.object({
	attempt: AttemptSummary,
	student: z.object({ name: z.string(), email: z.string() }),
	course: z.object({ id: Id, title: z.string() }),
	lesson: z.object({ id: Id, title: z.string() }),
	/** Баллы за вопросы с автопроверкой и максимум за ручные (для понимания итога). */
	autoScore: z.number(),
	manualMax: z.number().int(),
	passScorePct: z.number().int(),
	questions: z.array(
		z.object({
			id: Id,
			type: z.string(),
			points: z.number().int(),
			manual: z.boolean(),
			data: z.unknown(),
			response: z.unknown().nullable(),
			score: z.number().nullable(),
			isCorrect: z.boolean().nullable(),
			feedback: CommentText.nullable(),
		}),
	),
})
export type AttemptReview = z.infer<typeof AttemptReview>

export const reviewContract = {
	/** Попытка теста для ручной оценки (`open_text`). */
	attempt: oc.route({ method: 'GET', path: '/review/attempts/{attemptId}' }).input(ByAttempt).output(AttemptReview),
	/** Оценки ручных вопросов (баллы 0…максимум, шаг 0,5; комментарий). Оценены все — попытка `graded` с итогом и «сдал / не сдал». */
	gradeAttempt: oc
		.route({ method: 'POST', path: '/review/attempts/{attemptId}/grades' })
		.input(
			ByAttempt.extend({
				grades: z
					.array(
						z.object({ attemptQuestionId: Id, score: z.number().min(0).max(100), feedback: CommentText.nullable() }),
					)
					.min(1)
					.max(50),
			}),
		)
		.output(AttemptReview),
	list: oc.route({ method: 'GET', path: '/review/submissions' }).input(ReviewListInput).output(page(ReviewRow)),
	get: oc
		.route({ method: 'GET', path: '/review/submissions/{submissionId}' })
		.input(z.object({ submissionId: Id }))
		.output(ReviewDetail),
	/** Реплика проверяющего без решения (текст и/или файлы); в черновике — SUBMISSION_STATE. */
	comment: oc
		.route({ method: 'POST', path: '/review/submissions/{submissionId}/comments' })
		.input(z.object({ submissionId: Id }).extend(Reply.shape))
		.output(ReviewDetail),
}
