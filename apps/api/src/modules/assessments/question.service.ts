// Банк вопросов курса и теги (скилл lms-assessments, карточка 3.1). Хранение, ревизии и проверка схемой типа — ядро
// (`kernel/questions`); здесь — список с фильтрами, теги, права на курс, журнал.

import {
	type BankQuestion,
	type CourseTag,
	type QuestionListQuery,
	type QuestionRow,
	TAG_NAME_MAX,
	TAGS_PER_QUESTION_MAX,
} from '@dinastia/contracts/assessments'
import { toPlainText } from '@dinastia/contracts/common'
import { questions } from '@dinastia/db'
import type { AnyColumn } from 'drizzle-orm'
import { and, asc, count, eq, exists, inArray, isNull, sql } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import {
	archiveQuestion,
	createQuestion,
	getQuestion,
	type StoredQuestion,
	updateQuestion,
} from '#/kernel/questions/questions.ts'
import { courseOrFail } from '../courses/service.ts'
import { questionTagLinks, questionTags } from './schema.ts'

/** Тексты вопроса для поиска: все текстовые узлы документа (а не служебные ключи JSON). */
const promptText = sql`jsonb_path_query_array(${questions.prompt}, 'strict $.**.text')::text` as unknown as AnyColumn

const ROW_TEXT_MAX = 160

/** Есть ли у вопроса ответы учеников. Пока попыток нет (3.3) — всегда нет: правка на месте (D-052). */
export async function hasAnswers(_ctx: SchoolCtx, _questionId: string): Promise<boolean> {
	return false
}

/** Имена тегов: пробелы схлопнуты, без повторов (регистр не важен), не больше лимита. */
export function normalizeTags(names: readonly string[]): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const raw of names) {
		const name = raw.trim().replace(/\s+/g, ' ')
		if (!name || name.length > TAG_NAME_MAX) return fail.invalid('TAG_INVALID')
		if (seen.has(name.toLowerCase())) continue
		seen.add(name.toLowerCase())
		out.push(name)
	}
	if (out.length > TAGS_PER_QUESTION_MAX) return fail.invalid('TAGS_TOO_MANY')
	return out
}

async function tagsOf(ctx: SchoolCtx, questionIds: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>()
	if (!questionIds.length) return map
	const rows = await ctx.db
		.select({ questionId: questionTagLinks.questionId, name: questionTags.label })
		.from(questionTagLinks)
		.innerJoin(questionTags, eq(questionTags.id, questionTagLinks.tagId))
		.where(inArray(questionTagLinks.questionId, questionIds))
		.orderBy(asc(questionTags.label))
	for (const r of rows) map.set(r.questionId, [...(map.get(r.questionId) ?? []), r.name])
	return map
}

/** Теги вопроса: создать недостающие в курсе (по имени без учёта регистра) и заменить связи. */
async function setTags(ctx: SchoolCtx, courseId: string, questionId: string, names: string[]) {
	await ctx.db.delete(questionTagLinks).where(eq(questionTagLinks.questionId, questionId))
	if (!names.length) return
	await ctx.db
		.insert(questionTags)
		.values(names.map((label) => ({ courseId, label })))
		.onConflictDoNothing()
	const tags = await ctx.db
		.select({ id: questionTags.id })
		.from(questionTags)
		.where(
			and(
				eq(questionTags.courseId, courseId),
				inArray(
					sql`lower(${questionTags.label})`,
					names.map((n) => n.toLowerCase()),
				),
			),
		)
	await ctx.db.insert(questionTagLinks).values(tags.map((t) => ({ questionId, tagId: t.id })))
}

function toBank(q: StoredQuestion, tags: string[]): BankQuestion {
	return { id: q.id, courseId: q.courseId, type: q.type, data: q.data, tags }
}

/** Вопрос банка: текущий, не в архиве; иначе QUESTION_NOT_FOUND. */
async function bankQuestion(ctx: SchoolCtx, id: string): Promise<StoredQuestion> {
	const q = await getQuestion(ctx, id)
	if (!q.isCurrent || q.archivedAt) return fail.notFound('QUESTION_NOT_FOUND')
	return q
}

export async function listBank(ctx: SchoolCtx, input: QuestionListQuery) {
	await courseOrFail(ctx, input.courseId)
	const { type, tag } = input.filters
	const q = listQuery(
		{ ...input, filters: type ? { type } : {} },
		{
			search: [promptText],
			sort: { updatedAt: questions.updatedAt, createdAt: questions.createdAt, points: questions.points },
			tiebreak: questions.id,
			filters: { type: questions.type },
		},
	)
	const tagCondition = tag
		? exists(
				ctx.db
					.select({ one: sql`1` })
					.from(questionTagLinks)
					.innerJoin(questionTags, eq(questionTags.id, questionTagLinks.tagId))
					.where(
						and(
							eq(questionTagLinks.questionId, questions.id),
							eq(sql`lower(${questionTags.label})`, tag.toLowerCase()),
						),
					),
			)
		: undefined
	const where = and(
		eq(questions.courseId, input.courseId),
		eq(questions.isCurrent, true),
		isNull(questions.archivedAt),
		q.where,
		tagCondition,
	)
	const [rows, [total]] = await Promise.all([
		ctx.db
			.select({
				id: questions.id,
				type: questions.type,
				prompt: questions.prompt,
				points: questions.points,
				createdAt: questions.createdAt,
				updatedAt: questions.updatedAt,
			})
			.from(questions)
			.where(where)
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		ctx.db.select({ n: count() }).from(questions).where(where),
	])
	const tags = await tagsOf(
		ctx,
		rows.map((r) => r.id),
	)
	const items: QuestionRow[] = rows.map(({ prompt, ...r }) => ({
		...r,
		text: toPlainText(prompt as never, { maxLength: ROW_TEXT_MAX }).split('\n')[0] ?? '',
		tags: tags.get(r.id) ?? [],
	}))
	return toPage(items, total?.n ?? 0, input)
}

/**
 * Текущие ревизии вопросов по id: вопрос, заменённый ревизией (D-035), подменяется последней; архивный или несуществующий —
 * `null`. Нужен тесту (3.3): в нём хранится id вопроса на момент выбора.
 */
export async function resolveCurrent(
	ctx: SchoolCtx,
	ids: string[],
): Promise<Map<string, typeof questions.$inferSelect | null>> {
	const result = new Map<string, typeof questions.$inferSelect | null>(ids.map((id) => [id, null]))
	// от каждого id идём вперёд по цепочке ревизий (revision_of → следующая) до текущей
	let frontier = new Map(ids.map((id) => [id, id]))
	for (let hop = 0; hop < 20 && frontier.size; hop++) {
		const rows = await ctx.db
			.select()
			.from(questions)
			.where(inArray(questions.id, [...frontier.values()]))
		const next = new Map<string, string>()
		for (const [origin, id] of frontier) {
			const row = rows.find((r) => r.id === id)
			if (!row) continue
			if (row.isCurrent) result.set(origin, row.archivedAt ? null : row)
			else {
				const [child] = await ctx.db
					.select({ id: questions.id })
					.from(questions)
					.where(eq(questions.revisionOf, row.id))
					.limit(1)
				if (child) next.set(origin, child.id)
			}
		}
		frontier = next
	}
	return result
}

/** Строки списка по id вопросов (для редактора теста): порядок как во входе. */
export async function lookupQuestions(ctx: SchoolCtx, ids: string[]) {
	const resolved = await resolveCurrent(ctx, ids)
	const rows = [...resolved.values()].filter((r): r is NonNullable<typeof r> => r !== null)
	const tags = await tagsOf(
		ctx,
		rows.map((r) => r.id),
	)
	return ids.map((requestedId) => {
		const r = resolved.get(requestedId)
		const question: QuestionRow | null = r
			? {
					id: r.id,
					type: r.type,
					text: toPlainText(r.prompt as never, { maxLength: ROW_TEXT_MAX }).split('\n')[0] ?? '',
					points: r.points,
					tags: tags.get(r.id) ?? [],
					createdAt: r.createdAt,
					updatedAt: r.updatedAt,
				}
			: null
		return { requestedId, question }
	})
}

export async function getBankQuestion(ctx: SchoolCtx, id: string): Promise<BankQuestion> {
	const q = await bankQuestion(ctx, id)
	return toBank(q, (await tagsOf(ctx, [id])).get(id) ?? [])
}

export async function createBankQuestion(
	ctx: SchoolCtx,
	input: { courseId: string; type: string; data: unknown; tags: string[] },
): Promise<BankQuestion> {
	await courseOrFail(ctx, input.courseId)
	const tags = normalizeTags(input.tags)
	const q = await createQuestion(ctx, { courseId: input.courseId, type: input.type, data: input.data })
	await setTags(ctx, input.courseId, q.id, tags)
	return toBank(
		q,
		tags.slice().sort((a, b) => a.localeCompare(b)),
	)
}

/** Правка на месте, а у вопроса с ответами — новая ревизия (ядро: `reviseQuestion`, подключается с попытками, 3.3). */
export async function updateBankQuestion(
	ctx: SchoolCtx,
	input: { id: string; data: unknown; tags: string[] },
): Promise<BankQuestion> {
	const prev = await bankQuestion(ctx, input.id)
	const tags = normalizeTags(input.tags)
	if (await hasAnswers(ctx, input.id)) fail.conflict('QUESTION_HAS_ANSWERS') // до 3.3 недостижимо
	const q = await updateQuestion(ctx, input.id, input.data)
	await setTags(ctx, prev.courseId, q.id, tags)
	return getBankQuestion(ctx, q.id)
}

export async function archiveBankQuestion(ctx: SchoolCtx, id: string) {
	const q = await bankQuestion(ctx, id)
	await archiveQuestion(ctx, id)
	await ctx.audit('assessments.question.archived', {
		entity: 'question',
		id,
		diff: { courseId: q.courseId, type: q.type },
	})
	return { ok: true as const }
}

/** Теги курса с числом вопросов (текущие, не в архиве). */
export async function listTags(ctx: SchoolCtx, courseId: string): Promise<CourseTag[]> {
	await courseOrFail(ctx, courseId)
	const n = sql<number>`count(${questions.id}) filter (where ${questions.isCurrent} and ${questions.archivedAt} is null)::int`
	return ctx.db
		.select({ id: questionTags.id, name: questionTags.label, count: n })
		.from(questionTags)
		.leftJoin(questionTagLinks, eq(questionTagLinks.tagId, questionTags.id))
		.leftJoin(questions, eq(questions.id, questionTagLinks.questionId))
		.where(eq(questionTags.courseId, courseId))
		.groupBy(questionTags.id)
		.orderBy(asc(questionTags.label))
}

async function tagOrFail(ctx: SchoolCtx, id: string) {
	const [tag] = await ctx.db.select().from(questionTags).where(eq(questionTags.id, id)).limit(1)
	return tag ?? fail.notFound('TAG_NOT_FOUND')
}

export async function renameTag(ctx: SchoolCtx, input: { id: string; name: string }): Promise<CourseTag> {
	const tag = await tagOrFail(ctx, input.id)
	const name = input.name.trim().replace(/\s+/g, ' ')
	const [same] = await ctx.db
		.select({ id: questionTags.id })
		.from(questionTags)
		.where(and(eq(questionTags.courseId, tag.courseId), eq(sql`lower(${questionTags.label})`, name.toLowerCase())))
	if (same && same.id !== tag.id) return fail.conflict('TAG_EXISTS')
	await ctx.db.update(questionTags).set({ label: name }).where(eq(questionTags.id, tag.id))
	const found = (await listTags(ctx, tag.courseId)).find((t) => t.id === tag.id)
	return found as CourseTag
}

/** Удалить тег: связи снимаются каскадом, вопросы остаются. */
export async function removeTag(ctx: SchoolCtx, id: string) {
	const tag = await tagOrFail(ctx, id)
	await ctx.db.delete(questionTags).where(eq(questionTags.id, tag.id))
	return { ok: true as const }
}
