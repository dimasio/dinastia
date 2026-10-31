// Банк вопросов в БД (скилл question-types, D-035): общие таблицы questions/question_items, данные типа — по
// контракту defineQuestion (общие поля + uses.columns + элементы по kind). Ревизии и проверка ответа — здесь;
// когда правка создаёт ревизию (есть ответы), решает сервис модуля assessments (D-052).

import { questionItems, questions } from '@dinastia/db'
import {
	type AnyQuestionDef,
	COMMON_FIELDS,
	ITEM_FIELDS,
	type ItemKind,
	type QuestionGrade,
	questionDef,
	TYPE_COLUMNS,
	type TypeColumn,
} from '@dinastia/questions'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { BaseCtx, Tx } from '../context.ts'
import { fail } from '../errors.ts'

/** Шаг позиции элемента (скилл db-schema). */
const POSITION_STEP = 1000

/** Значения колонок типа, которые тип не использует: ядро держит их по умолчанию, а не «как прислали». */
const COLUMN_DEFAULTS: Record<TypeColumn, unknown> = {
	scoring: 'all_or_nothing',
	caseSensitive: false,
	numberAnswer: null,
	numberTolerance: 0,
}

export interface StoredQuestion {
	id: string
	courseId: string
	type: string
	revisionOf: string | null
	isCurrent: boolean
	archivedAt: Date | null
	/** Полные данные (с верными ответами) — только для банка вопросов и проверки. */
	data: Record<string, unknown>
}

type QuestionRow = typeof questions.$inferSelect
type ItemRow = typeof questionItems.$inferSelect

function defOf(type: string): AnyQuestionDef {
	const def = questionDef(type)
	if (!def) return fail.invalid('QUESTION_TYPE_UNKNOWN', { type })
	return def
}

const itemFields = (def: AnyQuestionDef) => Object.entries(def.items ?? {}) as [string, ItemKind][]

function toData(def: AnyQuestionDef, row: QuestionRow, items: ItemRow[]): Record<string, unknown> {
	const data: Record<string, unknown> = {}
	for (const f of COMMON_FIELDS) data[f] = row[f]
	for (const c of def.uses.columns) data[c] = row[c]
	for (const [field, kind] of itemFields(def)) {
		data[field] = items
			.filter((i) => i.kind === kind)
			.map((i) => ({ id: i.id, ...Object.fromEntries(ITEM_FIELDS[kind].map((f) => [f, i[f]])) }))
	}
	return data
}

/** Колонки строки questions из данных: чужие для типа колонки — по умолчанию. */
function columnsOf(def: AnyQuestionDef, parsed: Record<string, unknown>) {
	const cols: Record<string, unknown> = {}
	for (const f of COMMON_FIELDS) cols[f] = parsed[f] ?? null
	for (const c of TYPE_COLUMNS)
		cols[c] = (def.uses.columns as readonly string[]).includes(c) ? parsed[c] : COLUMN_DEFAULTS[c]
	return cols
}

/**
 * Записать элементы вопроса заново. `keepIds` — id элементов этого вопроса до правки: переданный id сохраняется,
 * только если он из этого множества (чужой или выдуманный — новый id).
 */
async function writeItems(
	tx: Tx,
	def: AnyQuestionDef,
	questionId: string,
	parsed: Record<string, unknown>,
	keepIds: Set<string>,
) {
	await tx.delete(questionItems).where(eq(questionItems.questionId, questionId))
	const rows = itemFields(def).flatMap(([field, kind]) =>
		((parsed[field] as Record<string, unknown>[] | undefined) ?? []).map((item, i) => ({
			...(typeof item.id === 'string' && keepIds.has(item.id) ? { id: item.id } : {}),
			questionId,
			kind,
			position: i * POSITION_STEP,
			...Object.fromEntries(ITEM_FIELDS[kind].map((f) => [f, item[f] ?? (f === 'isCorrect' ? false : null)])),
		})),
	)
	if (rows.length) await tx.insert(questionItems).values(rows as never)
}

async function loadMany(tx: Tx, rows: QuestionRow[]): Promise<StoredQuestion[]> {
	if (!rows.length) return []
	const items = await tx
		.select()
		.from(questionItems)
		.where(
			inArray(
				questionItems.questionId,
				rows.map((r) => r.id),
			),
		)
		.orderBy(asc(questionItems.position))
	return rows.map((r) => ({
		id: r.id,
		courseId: r.courseId,
		type: r.type,
		revisionOf: r.revisionOf,
		isCurrent: r.isCurrent,
		archivedAt: r.archivedAt,
		data: toData(
			defOf(r.type),
			r,
			items.filter((i) => i.questionId === r.id),
		),
	}))
}

/** Вопросы по id (любые ревизии) с данными — пачкой. */
export async function getQuestions(ctx: BaseCtx, ids: string[]): Promise<StoredQuestion[]> {
	if (!ids.length) return []
	return loadMany(ctx.db, await ctx.db.select().from(questions).where(inArray(questions.id, ids)))
}

export async function getQuestion(ctx: BaseCtx, id: string): Promise<StoredQuestion> {
	const [q] = await getQuestions(ctx, [id])
	return q ?? fail.notFound('QUESTION_NOT_FOUND')
}

/** Банк курса: текущие ревизии, без архивных. */
export async function listQuestions(ctx: BaseCtx, courseId: string): Promise<StoredQuestion[]> {
	const rows = await ctx.db
		.select()
		.from(questions)
		.where(and(eq(questions.courseId, courseId), eq(questions.isCurrent, true), isNull(questions.archivedAt)))
		.orderBy(asc(questions.createdAt), asc(questions.id))
	return loadMany(ctx.db, rows)
}

export async function createQuestion(
	ctx: BaseCtx,
	input: { courseId: string; type: string; data: unknown },
): Promise<StoredQuestion> {
	const def = defOf(input.type)
	const parsed = def.schema.parse(input.data) as Record<string, unknown>
	const [row] = await ctx.db
		.insert(questions)
		.values({ courseId: input.courseId, type: input.type, ...columnsOf(def, parsed) } as never)
		.returning({ id: questions.id })
	if (!row) throw new Error('вопрос не создан')
	await writeItems(ctx.db, def, row.id, parsed, new Set())
	return getQuestion(ctx, row.id)
}

async function currentOrFail(ctx: BaseCtx, id: string) {
	const [row] = await ctx.db.select().from(questions).where(eq(questions.id, id)).for('update')
	if (!row) return fail.notFound('QUESTION_NOT_FOUND')
	if (!row.isCurrent) return fail.conflict('QUESTION_NOT_CURRENT', { id })
	if (row.archivedAt) return fail.conflict('QUESTION_ARCHIVED', { id })
	return row
}

const itemIdsOf = async (tx: Tx, questionId: string) =>
	new Set(
		(await tx.select({ id: questionItems.id }).from(questionItems).where(eq(questionItems.questionId, questionId))).map(
			(r) => r.id,
		),
	)

/** Правка на месте — пока на вопрос нет ответов. Элементы сохраняют id, если они пришли из этого вопроса. */
export async function updateQuestion(ctx: BaseCtx, id: string, data: unknown): Promise<StoredQuestion> {
	const row = await currentOrFail(ctx, id)
	const def = defOf(row.type)
	const parsed = def.schema.parse(data) as Record<string, unknown>
	const keep = await itemIdsOf(ctx.db, id)
	await ctx.db
		.update(questions)
		.set(columnsOf(def, parsed) as never)
		.where(eq(questions.id, id))
	await writeItems(ctx.db, def, id, parsed, keep)
	return getQuestion(ctx, id)
}

/**
 * Правка вопроса с ответами (D-035): новая ревизия с данными `data` (элементы — с новыми id), у прежней
 * `is_current = false`; попытки остаются со своей ревизией и её элементами.
 */
export async function reviseQuestion(ctx: BaseCtx, id: string, data: unknown): Promise<StoredQuestion> {
	const prev = await currentOrFail(ctx, id)
	const def = defOf(prev.type)
	const parsed = def.schema.parse(data) as Record<string, unknown>
	await ctx.db.update(questions).set({ isCurrent: false }).where(eq(questions.id, id))
	const [row] = await ctx.db
		.insert(questions)
		.values({ courseId: prev.courseId, type: prev.type, revisionOf: prev.id, ...columnsOf(def, parsed) } as never)
		.returning({ id: questions.id })
	if (!row) throw new Error('ревизия не создана')
	await writeItems(ctx.db, def, row.id, parsed, new Set())
	return getQuestion(ctx, row.id)
}

/** Убрать из банка (попытки и прежние ревизии остаются). */
export async function archiveQuestion(ctx: BaseCtx, id: string) {
	await currentOrFail(ctx, id)
	await ctx.db.update(questions).set({ archivedAt: ctx.now() }).where(eq(questions.id, id))
}

/** Данные вопроса для ученика в попытке — без верных ответов и пояснения (toPublic типа). */
export function publicQuestion(q: StoredQuestion): unknown {
	return defOf(q.type).toPublic(q.data)
}

/** Разбор вопроса — отдавать, только если правило теста (show_correct) разрешает. */
export function reviewQuestion(q: StoredQuestion): unknown {
	return defOf(q.type).review(q.data)
}

/**
 * Проверить ответ ученика (только сервер): ответ — по схеме типа (ZodError → 400), результат — grade типа;
 * ручная проверка (manual) — null. Баллы вне [0, max] — ошибка типа, а не ученика.
 */
export function gradeAnswer(q: StoredQuestion, response: unknown): QuestionGrade | null {
	const def = defOf(q.type)
	if (def.manual || !def.grade) return null
	const result = def.grade(q.data, def.responseSchema.parse(response))
	if (!(result.score >= 0 && result.score <= result.max))
		throw new Error(`вопрос «${q.type}»: grade вернул ${result.score} из ${result.max}`)
	return result
}
