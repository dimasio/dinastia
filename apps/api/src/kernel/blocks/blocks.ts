// Блоки урока в БД (скилл lesson-blocks, D-033, D-034): строки lesson_blocks + таблицы типов. Ядро делает load/save/copy
// по паре «определение + таблицы» (@dinastia/blocks/server) и публикацию урока строками. Правка — только черновика.
import { blockDataIssues } from '@dinastia/blocks'
import { type BlockStorage, blockStorage } from '@dinastia/blocks/server'
import { lessonBlocks } from '@dinastia/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { BaseCtx, Tx } from '../context.ts'
import { fail } from '../errors.ts'

/** Шаг позиции (скилл db-schema): вставка между соседями без перенумерации. */
export const POSITION_STEP = 1000

type State = 'draft' | 'published'

export interface LessonBlock {
	id: string
	blockKey: string
	type: string
	position: number
	isRequired: boolean
	data: Record<string, unknown>
}

function storageOf(type: string): BlockStorage {
	const s = blockStorage(type)
	if (!s) return fail.invalid('BLOCK_TYPE_UNKNOWN', { type })
	return s
}

const childFields = (s: BlockStorage) => Object.keys(s.children)
const mainFields = (s: BlockStorage) =>
	Object.keys(s.def.schema.shape as Record<string, unknown>).filter((k) => !childFields(s).includes(k))

/** Данные блоков одного типа: колонки таблицы типа + дочерние строки по position (элемент — с `key`). */
async function loadData(tx: Tx, s: BlockStorage, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
	const out = new Map<string, Record<string, unknown>>()
	if (!ids.length) return out
	const rows = (await tx.select().from(s.table).where(inArray(s.table.blockId, ids))) as Record<string, unknown>[]
	const fields = mainFields(s)
	for (const row of rows) out.set(row.blockId as string, Object.fromEntries(fields.map((f) => [f, row[f]])))
	for (const [field, child] of Object.entries(s.children)) {
		const items = (await tx
			.select()
			.from(child)
			.where(inArray(child.blockId, ids))
			.orderBy(asc(child.position))) as Record<string, unknown>[]
		for (const id of ids) {
			const data = out.get(id)
			if (data) data[field] = []
		}
		for (const { id: _id, schoolId: _s, blockId, position: _p, itemKey, ...rest } of items) {
			const list = out.get(blockId as string)?.[field] as unknown[] | undefined
			list?.push({ key: itemKey, ...rest })
		}
	}
	return out
}

/** Записать данные блока (проверка схемой типа): строка таблицы типа и замена дочерних строк. */
async function saveData(tx: Tx, s: BlockStorage, blockId: string, data: unknown) {
	const parsed = s.def.schema.parse(data) as Record<string, unknown>
	const main = Object.fromEntries(mainFields(s).map((f) => [f, parsed[f]]))
	const insert = tx.insert(s.table).values({ blockId, ...main } as never)
	await (Object.keys(main).length
		? insert.onConflictDoUpdate({ target: s.table.blockId, set: main as never })
		: insert.onConflictDoNothing())
	for (const [field, child] of Object.entries(s.children)) {
		await tx.delete(child).where(eq(child.blockId, blockId))
		const items = (parsed[field] as Record<string, unknown>[] | undefined) ?? []
		if (!items.length) continue
		await tx.insert(child).values(
			items.map(({ key, ...rest }, i) => ({
				blockId,
				position: i * POSITION_STEP,
				...(typeof key === 'string' ? { itemKey: key } : {}),
				...rest,
			})) as never,
		)
	}
	return parsed
}

/** Строки блоков урока по порядку с данными; типы — пачкой (без N+1). */
async function loadRows(tx: Tx, rows: (typeof lessonBlocks.$inferSelect)[]): Promise<LessonBlock[]> {
	const byType = new Map<string, string[]>()
	for (const r of rows) byType.set(r.type, [...(byType.get(r.type) ?? []), r.id])
	const data = new Map<string, Record<string, unknown>>()
	for (const [type, ids] of byType) for (const [id, d] of await loadData(tx, storageOf(type), ids)) data.set(id, d)
	return rows.map((r) => ({
		id: r.id,
		blockKey: r.blockKey,
		type: r.type,
		position: r.position,
		isRequired: r.isRequired,
		data: data.get(r.id) ?? {},
	}))
}

const rowsOf = (tx: Tx, lessonId: string, state: State) =>
	tx
		.select()
		.from(lessonBlocks)
		.where(and(eq(lessonBlocks.lessonId, lessonId), eq(lessonBlocks.state, state)))
		.orderBy(asc(lessonBlocks.position), asc(lessonBlocks.id))

export async function listBlocks(ctx: BaseCtx, lessonId: string, state: State = 'draft') {
	return loadRows(ctx.db, await rowsOf(ctx.db, lessonId, state))
}

/** Блоки урока для ученика: только опубликованные, данные — через toPublic типа (секреты не уходят). */
export async function listPublicBlocks(ctx: BaseCtx, lessonId: string) {
	return (await listBlocks(ctx, lessonId, 'published')).map(({ data, ...b }) => ({
		...b,
		data: storageOf(b.type).def.toPublic(data) as unknown,
	}))
}

async function draftOrFail(ctx: BaseCtx, id: string) {
	const [row] = await ctx.db.select().from(lessonBlocks).where(eq(lessonBlocks.id, id)).limit(1)
	if (!row) return fail.notFound('BLOCK_NOT_FOUND')
	if (row.state !== 'draft') return fail.conflict('BLOCK_NOT_DRAFT')
	return row
}

/** Новый блок в черновике урока: данные — переданные или defaults() типа; без позиции — в конец. */
export async function createBlock(
	ctx: BaseCtx,
	input: { lessonId: string; type: string; position?: number; isRequired?: boolean; data?: unknown },
): Promise<LessonBlock> {
	const s = storageOf(input.type)
	const data = input.data ?? s.def.defaults()
	s.def.schema.parse(data)
	let position = input.position
	if (position === undefined) {
		const rows = await rowsOf(ctx.db, input.lessonId, 'draft')
		position = rows.length ? (rows.at(-1)?.position ?? 0) + POSITION_STEP : 0
	}
	const [row] = await ctx.db
		.insert(lessonBlocks)
		.values({ lessonId: input.lessonId, type: input.type, position, isRequired: input.isRequired ?? false })
		.returning()
	if (!row) throw new Error('блок не создан')
	const saved = await saveData(ctx.db, s, row.id, data)
	return { id: row.id, blockKey: row.blockKey, type: row.type, position, isRequired: row.isRequired, data: saved }
}

/** Изменить данные черновика блока (полная замена по схеме типа). */
export async function updateBlock(ctx: BaseCtx, id: string, data: unknown) {
	const row = await draftOrFail(ctx, id)
	const saved = await saveData(ctx.db, storageOf(row.type), id, data)
	await ctx.db.update(lessonBlocks).set({ updatedAt: ctx.now() }).where(eq(lessonBlocks.id, id))
	return { id, blockKey: row.blockKey, type: row.type, position: row.position, isRequired: row.isRequired, data: saved }
}

/** Удалить блок из черновика; данные типа и дочерние строки — каскадом. Опубликованная версия живёт до публикации. */
export async function removeBlock(ctx: BaseCtx, id: string) {
	await draftOrFail(ctx, id)
	await ctx.db.delete(lessonBlocks).where(eq(lessonBlocks.id, id))
}

/** Порядок блоков черновика: ids — все блоки черновика урока в новом порядке. */
export async function reorderBlocks(ctx: BaseCtx, lessonId: string, ids: string[]) {
	const rows = await rowsOf(ctx.db, lessonId, 'draft')
	const current = new Set(rows.map((r) => r.id))
	if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id)))
		fail.invalid('BLOCK_ORDER_MISMATCH')
	for (const [i, id] of ids.entries())
		await ctx.db
			.update(lessonBlocks)
			.set({ position: i * POSITION_STEP })
			.where(eq(lessonBlocks.id, id))
}

/** Блок черновика, не готовый к публикации: ключи замечаний типа (`blocks:<type>.issues.<ключ>`). */
export interface BlockIssue {
	id: string
	type: string
	issues: string[]
}

const issuesOf = (blocks: LessonBlock[]): BlockIssue[] =>
	blocks
		.map((b) => ({ id: b.id, type: b.type, issues: blockDataIssues(storageOf(b.type).def, b.data) }))
		.filter((b) => b.issues.length > 0)

/** Замечания к черновику урока (пусто — можно публиковать). */
export async function draftIssues(ctx: BaseCtx, lessonId: string): Promise<BlockIssue[]> {
	return issuesOf(await listBlocks(ctx, lessonId, 'draft'))
}

/**
 * Опубликовать урок (D-033): опубликованные строки заменяются копией черновика с тем же block_key — одной
 * транзакцией (ctx.db). Ответы учеников ссылаются на block_key и item_key, поэтому повторная публикация их не теряет.
 * Блоки с замечаниями (`issues` типа) — LESSON_HAS_ISSUES со списком, публикация не меняется.
 */
export async function publishBlocks(ctx: BaseCtx, lessonId: string) {
	const drafts = await rowsOf(ctx.db, lessonId, 'draft').for('update')
	const loaded = await loadRows(ctx.db, drafts)
	const issues = issuesOf(loaded)
	if (issues.length) return fail.conflict('LESSON_HAS_ISSUES', { blocks: issues })
	await ctx.db.delete(lessonBlocks).where(and(eq(lessonBlocks.lessonId, lessonId), eq(lessonBlocks.state, 'published')))
	for (const b of loaded) {
		const [row] = await ctx.db
			.insert(lessonBlocks)
			.values({
				lessonId,
				blockKey: b.blockKey,
				state: 'published',
				type: b.type,
				position: b.position,
				isRequired: b.isRequired,
			})
			.returning({ id: lessonBlocks.id })
		if (!row) throw new Error('публикация блока не создана')
		await saveData(ctx.db, storageOf(b.type), row.id, b.data)
	}
	return { published: loaded.length }
}
