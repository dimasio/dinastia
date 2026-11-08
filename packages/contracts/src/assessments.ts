// Контракт модуля assessments (скилл api-endpoints, lms-assessments): банк вопросов курса и теги. Карточка —
// docs/tasks/phase-3-assessments/changes/3.1-question-bank.md. Данные вопроса — схема типа из реестра вопросов
// (`@dinastia/questions`), сервер проверяет ею при записи.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Id, page, pageInput } from './common/index.ts'

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

export const assessmentsContract = {
	questions: {
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/questions' })
			.input(QuestionListInput)
			.output(page(QuestionRow)),
		get: oc.route({ method: 'GET', path: '/questions/{id}' }).input(ById).output(BankQuestion),
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
