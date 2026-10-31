// Реестр блоков (скилл lesson-blocks): контракт defineBlock, сверка схемы с таблицами, согласованность реестров.

import { hasPath } from '@dinastia/contracts/common'
import { blockChildTable, blockTable } from '@dinastia/db'
import { boolean, integer, text } from 'drizzle-orm/pg-core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import blocksI18n from '../../i18n/locales/ru/blocks.json' with { type: 'json' }
import CalloutViewer from './callout/viewer.tsx'
import { defineBlock } from './define.ts'
import { clientBlocks } from './registry.client.ts'
import { blocks } from './registry.ts'
import { blockStorageIssues, blockStorages, defineBlockStorage } from './server.ts'

const base = {
	category: 'content' as const,
	completion: 'none' as const,
	schema: z.object({ title: z.string().min(1) }),
	defaults: () => ({ title: 'x' }),
}

describe('defineBlock', () => {
	it.each([
		['тип не snake_case', { ...base, type: 'Callout' }, 'snake_case'],
		['defaults не проходят схему', { ...base, type: 'bad_defaults', defaults: () => ({ title: '' }) }, 'defaults()'],
		[
			'секреты без toPublic',
			{
				...base,
				type: 'no_public',
				schema: z.object({ answer: z.string() }),
				defaults: () => ({ answer: 'a' }),
				secretKeys: ['answer'],
			},
			'toPublic',
		],
		[
			'toPublic оставил секрет',
			{
				...base,
				type: 'leaky',
				schema: z.object({ items: z.array(z.object({ ok: z.boolean() })) }),
				defaults: () => ({ items: [] }),
				example: () => ({ items: [{ ok: true }] }),
				secretKeys: ['items.*.ok'],
				toPublic: (d: { items: { ok: boolean }[] }) => d,
			},
			'не убирает items.*.ok',
		],
		[
			'секреты без example (в defaults список пуст — проверять нечего)',
			{
				...base,
				type: 'no_example',
				schema: z.object({ items: z.array(z.object({ ok: z.boolean() })) }),
				defaults: () => ({ items: [] }),
				secretKeys: ['items.*.ok'],
				toPublic: (d: { items: { ok: boolean }[] }) => ({ n: d.items.length }),
			},
			'нужен example()',
		],
		[
			'в example нет секрета',
			{
				...base,
				type: 'empty_example',
				schema: z.object({ items: z.array(z.object({ ok: z.boolean() })) }),
				defaults: () => ({ items: [] }),
				example: () => ({ items: [] }),
				secretKeys: ['items.*.ok'],
				toPublic: (d: { items: { ok: boolean }[] }) => ({ n: d.items.length }),
			},
			'нечего проверять',
		],
		[
			'interaction без evaluate',
			{ ...base, type: 'no_eval', category: 'interactive' as const, completion: 'interaction' as const },
			'evaluate',
		],
		['children без поля', { ...base, type: 'no_field', children: { cards: 'cards' } }, 'children.cards'],
	])('%s — ошибка при объявлении', (_name, def, message) => {
		expect(() => defineBlock(def as never)).toThrow(message)
	})

	it('пути секретов: звёздочка — каждый элемент', () => {
		expect(hasPath({ items: [{ a: 1 }, { b: 2 }] }, 'items.*.b')).toBe(true)
		expect(hasPath({ items: [{ a: 1 }] }, 'items.*.b')).toBe(false)
		expect(hasPath({ answer: 1 }, 'answer')).toBe(true)
	})
})

describe('схема = таблицы', () => {
	const t = blockTable('probe_match', { title: text('title').notNull(), level: integer('level').notNull() })
	const items = blockChildTable(t, 'items', { label: text('label').notNull(), extra: boolean('extra') })
	const def = defineBlock({
		...base,
		type: 'probe_match',
		schema: z.object({
			title: z.string(),
			color: z.string(),
			items: z.array(z.object({ key: z.uuid().optional(), label: z.string() })),
		}),
		defaults: () => ({ title: 'x', color: 'red', items: [] }),
		children: { items: 'items' },
	})

	it('расхождения полей и колонок перечислены', () => {
		expect(blockStorageIssues({ def, table: t, children: { items } })).toEqual([
			'нет колонок для полей схемы: color',
			'колонки без поля в схеме: level',
			'items: колонки без поля в схеме: extra',
		])
		expect(() => defineBlockStorage(def, t, {})).toThrow('children определения [items] ≠ дочерние таблицы []')
	})
})

describe('реестры согласованы', () => {
	const types = Object.keys(blocks).sort()

	it('у каждого типа: хранение, клиентские компоненты, иконка, строки палитры', () => {
		expect(Object.keys(blockStorages).sort()).toEqual(types)
		expect(Object.keys(clientBlocks).sort()).toEqual(types)
		for (const type of types) {
			expect(blocks[type as keyof typeof blocks].type, 'ключ реестра = type').toBe(type)
			expect(blockStorageIssues(blockStorages[type] as never), type).toEqual([])
			const strings = (blocksI18n as Record<string, { title?: string; description?: string }>)[type]
			expect(strings?.title, `blocks:${type}.title`).toBeTruthy()
			expect(strings?.description, `blocks:${type}.description`).toBeTruthy()
		}
	})
})

describe('callout', () => {
	it('просмотр: тон и текст из публичных данных', () => {
		const html = renderToStaticMarkup(
			<CalloutViewer
				testId="c"
				data={{
					tone: 'warning',
					body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Осторожно' }] }] },
				}}
			/>,
		)
		expect(html).toContain('data-tone="warning"')
		expect(html).toContain('<p>Осторожно</p>')
	})
})
