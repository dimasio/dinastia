// Блоки урока в БД (D-033, D-034): create → save → load → publish, стабильные block_key/item_key, toPublic, черновик
// правится, публикация — нет, изоляция школ, каскад. Пробный тип с дочерней таблицей и секретом — test/probes.ts.
import { randomUUID } from 'node:crypto'
import { defineBlock } from '@dinastia/blocks'
import { blockCallout, defineBlockStorage, registerProbeBlock } from '@dinastia/blocks/server'
import { schools } from '@dinastia/db'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError, z } from 'zod'
import { probeBlockItems as probeItems, probeBlock as probeTable } from '#/test/probes.ts'
import type { BaseCtx } from '../context.ts'
import { db, pool } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { AppError } from '../errors.ts'
import { log } from '../log.ts'
import { tenantCtx } from '../tenant-ctx.ts'
import {
	createBlock,
	listBlocks,
	listPublicBlocks,
	publishBlocks,
	removeBlock,
	reorderBlocks,
	updateBlock,
} from './blocks.ts'

// Пробный интерактивный тип: список с секретом в дочерней таблице (таблицы — test/probes.ts, global-setup).
const probe = defineBlock({
	type: 'kernel_probe_cards',
	category: 'interactive',
	schema: z.object({
		shuffle: z.boolean(),
		items: z.array(z.object({ key: z.uuid().optional(), front: z.string().max(100), isCorrect: z.boolean() })).max(20),
	}),
	children: { items: 'items' },
	defaults: () => ({ shuffle: false, items: [] }),
	completion: 'interaction',
	secretKeys: ['items.*.isCorrect'],
	toPublic: (d) => ({ shuffle: d.shuffle, items: d.items.map(({ isCorrect: _, ...i }) => i) }),
	responseSchema: z.object({ key: z.uuid() }),
	evaluate: (d, r) => {
		const ok = d.items.find((i) => i.key === r.key)?.isCorrect === true
		return { score: ok ? 1 : 0, max: 1, done: true }
	},
})
registerProbeBlock(defineBlockStorage(probe, probeTable, { items: probeItems }))

let schoolA: { id: string; slug: string; name: string }
let schoolB: { id: string; slug: string; name: string }
const inSchool = <T>(school: typeof schoolA, fn: (ctx: BaseCtx) => Promise<T>) =>
	withTenant(school.id, (tx) => fn(tenantCtx(tx, school, { now: () => new Date(), log })))

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

beforeAll(async () => {
	const rows = await db
		.insert(schools)
		.values([
			{ slug: `blk-a-${randomUUID().slice(0, 8)}`, name: 'A' },
			{ slug: `blk-b-${randomUUID().slice(0, 8)}`, name: 'B' },
		])
		.returning({ id: schools.id, slug: schools.slug, name: schools.name })
	if (!rows[0] || !rows[1]) throw new Error('школы не созданы')
	;[schoolA, schoolB] = [rows[0], rows[1]]
})

afterAll(async () => {
	await db.delete(schools).where(inArray(schools.id, [schoolA.id, schoolB.id]))
	await pool.end()
})

describe('черновик и публикация (callout)', () => {
	it('новый блок — defaults типа, в конец урока; правка черновика; публикация — копия с тем же block_key', async () => {
		const lessonId = randomUUID()
		await inSchool(schoolA, async (ctx) => {
			const first = await createBlock(ctx, { lessonId, type: 'callout' })
			expect(first.data).toEqual({ tone: 'info', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
			const second = await createBlock(ctx, { lessonId, type: 'callout', data: { tone: 'warning', body: doc('Два') } })
			expect([first.position, second.position]).toEqual([0, 1000])
			await updateBlock(ctx, first.id, { tone: 'success', body: doc('Один') })

			expect(await listBlocks(ctx, lessonId, 'published')).toEqual([])
			expect(await publishBlocks(ctx, lessonId)).toEqual({ published: 2 })
			const published = await listPublicBlocks(ctx, lessonId)
			expect(published.map((b) => [b.blockKey, b.data])).toEqual([
				[first.blockKey, { tone: 'success', body: doc('Один') }],
				[second.blockKey, { tone: 'warning', body: doc('Два') }],
			])
			expect(published.map((b) => b.id)).not.toContain(first.id)

			// правка черновика не меняет опубликованное до новой публикации
			await updateBlock(ctx, second.id, { tone: 'info', body: doc('Два, правка') })
			await removeBlock(ctx, first.id)
			expect((await listPublicBlocks(ctx, lessonId)).map((b) => b.blockKey)).toEqual([first.blockKey, second.blockKey])

			const before = published.map((b) => b.id)
			await publishBlocks(ctx, lessonId)
			const again = await listPublicBlocks(ctx, lessonId)
			expect(again.map((b) => [b.blockKey, b.data])).toEqual([
				[second.blockKey, { tone: 'info', body: doc('Два, правка') }],
			])
			// прежние опубликованные строки удалены вместе с данными типа (каскад)
			expect(await ctx.db.select().from(blockCallout).where(inArray(blockCallout.blockId, before))).toEqual([])
		})
	})

	it('опубликованную строку не правят и не удаляют; неизвестный тип и неверные данные — ошибки', async () => {
		const lessonId = randomUUID()
		await inSchool(schoolA, async (ctx) => {
			const b = await createBlock(ctx, { lessonId, type: 'callout' })
			await publishBlocks(ctx, lessonId)
			const [pub] = await listBlocks(ctx, lessonId, 'published')
			await expect(updateBlock(ctx, pub?.id ?? '', b.data)).rejects.toMatchObject({ code: 'BLOCK_NOT_DRAFT' })
			await expect(removeBlock(ctx, pub?.id ?? '')).rejects.toMatchObject({ code: 'BLOCK_NOT_DRAFT' })
			await expect(createBlock(ctx, { lessonId, type: 'nope' })).rejects.toBeInstanceOf(AppError)
			await expect(updateBlock(ctx, b.id, { tone: 'loud', body: doc('x') })).rejects.toBeInstanceOf(ZodError)
			await expect(
				updateBlock(ctx, b.id, {
					tone: 'info',
					body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 } }] },
				}),
			).rejects.toBeInstanceOf(ZodError) // профиль compact: заголовков нет
			await expect(updateBlock(ctx, randomUUID(), b.data)).rejects.toMatchObject({ code: 'BLOCK_NOT_FOUND' })
		})
	})

	it('порядок черновика; неполный список — ошибка', async () => {
		const lessonId = randomUUID()
		await inSchool(schoolA, async (ctx) => {
			const ids = [
				(await createBlock(ctx, { lessonId, type: 'callout' })).id,
				(await createBlock(ctx, { lessonId, type: 'callout' })).id,
				(await createBlock(ctx, { lessonId, type: 'callout' })).id,
			]
			await reorderBlocks(ctx, lessonId, [ids[2], ids[0], ids[1]] as string[])
			expect((await listBlocks(ctx, lessonId)).map((b) => b.id)).toEqual([ids[2], ids[0], ids[1]])
			await expect(reorderBlocks(ctx, lessonId, [ids[0]] as string[])).rejects.toMatchObject({
				code: 'BLOCK_ORDER_MISMATCH',
			})
		})
	})
})

describe('дочерние таблицы и секреты (пробный тип)', () => {
	it('элементы по порядку со стабильным key — в черновике и в публикации; ученику — без секретов', async () => {
		const lessonId = randomUUID()
		await inSchool(schoolA, async (ctx) => {
			const b = await createBlock(ctx, {
				lessonId,
				type: 'kernel_probe_cards',
				data: {
					shuffle: true,
					items: [
						{ front: 'A', isCorrect: true },
						{ front: 'B', isCorrect: false },
					],
				},
			})
			const items = b.data.items as { key?: string; front: string }[]
			const [loaded] = await listBlocks(ctx, lessonId)
			const keys = ((loaded?.data.items ?? []) as { key: string }[]).map((i) => i.key)
			expect(keys).toHaveLength(2)
			expect(items.map((i) => i.front)).toEqual(['A', 'B'])

			// новый порядок и правка: ключи элементов сохраняются
			const [ka, kb] = keys as [string, string]
			await updateBlock(ctx, b.id, {
				shuffle: true,
				items: [
					{ key: kb, front: 'B', isCorrect: false },
					{ key: ka, front: 'A!', isCorrect: true },
				],
			})
			const [draft] = await listBlocks(ctx, lessonId)
			expect(draft?.data.items).toEqual([
				{ key: kb, front: 'B', isCorrect: false },
				{ key: ka, front: 'A!', isCorrect: true },
			])

			await publishBlocks(ctx, lessonId)
			await publishBlocks(ctx, lessonId)
			const [pub] = await listPublicBlocks(ctx, lessonId)
			expect(pub?.data).toEqual({
				shuffle: true,
				items: [
					{ key: kb, front: 'B' },
					{ key: ka, front: 'A!' },
				],
			})
			expect(JSON.stringify(pub)).not.toContain('isCorrect')
			expect(probe.evaluate?.(draft?.data as never, { key: ka })).toEqual({ score: 1, max: 1, done: true })
		})
	})

	it('другая школа не видит блоков; удаление строки блока удаляет данные типа и элементы', async () => {
		const lessonId = randomUUID()
		const b = await inSchool(schoolA, (ctx) =>
			createBlock(ctx, {
				lessonId,
				type: 'kernel_probe_cards',
				data: { shuffle: false, items: [{ front: 'x', isCorrect: true }] },
			}),
		)
		expect(await inSchool(schoolB, (ctx) => listBlocks(ctx, lessonId))).toEqual([])
		await expect(inSchool(schoolB, (ctx) => updateBlock(ctx, b.id, b.data))).rejects.toMatchObject({
			code: 'BLOCK_NOT_FOUND',
		})
		await inSchool(schoolA, async (ctx) => {
			await removeBlock(ctx, b.id)
			expect(await ctx.db.select().from(probeTable).where(eq(probeTable.blockId, b.id))).toEqual([])
			expect(await ctx.db.select().from(probeItems).where(eq(probeItems.blockId, b.id))).toEqual([])
		})
	})
})
