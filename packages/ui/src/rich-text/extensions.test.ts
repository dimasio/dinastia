// Редактор ↔ валидатор (скилл rich-text): то, что выдаёт схема редактора профиля (с атрибутами по умолчанию),
// сервер принимает; то, чего профиль не разрешает, в схеме редактора нет.
import { RICH_TEXT_PROFILES, type RichTextProfile, richTextIssues } from '@dinastia/contracts/common'
import { getSchema } from '@tiptap/core'
import { Node } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { richTextExtensions } from './extensions.ts'

const FILE = '0199e3a0-0000-7000-8000-000000000001'
const p = (...content: object[]) => ({ type: 'paragraph', content })
const t = (text: string, marks?: object[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })

/** Минимальные документы без атрибутов — схема редактора дополнит их значениями по умолчанию. */
const samples: Record<string, object> = {
	heading: { type: 'heading', attrs: { level: 3 }, content: [t('h')] },
	bulletList: { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a'))] }] },
	orderedList: { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('a'))] }] },
	taskList: { type: 'taskList', content: [{ type: 'taskItem', content: [p(t('a'))] }] },
	blockquote: { type: 'blockquote', content: [p(t('q'))] },
	codeBlock: { type: 'codeBlock', content: [t('x')] },
	image: { type: 'image', attrs: { fileId: FILE } },
	table: {
		type: 'table',
		content: [
			{
				type: 'tableRow',
				content: [
					{ type: 'tableHeader', content: [p(t('a'))] },
					{ type: 'tableCell', content: [p(t('b'))] },
				],
			},
		],
	},
	horizontalRule: { type: 'horizontalRule' },
	hardBreak: p(t('a'), { type: 'hardBreak' }, t('b')),
}
const markSamples: Record<string, object> = {
	link: { type: 'link', attrs: { href: 'https://example.com' } },
	textStyle: { type: 'textStyle', attrs: { color: 'blue' } },
}

describe.each(['lesson', 'compact', 'comment'] as RichTextProfile[])('профиль %s', (profile) => {
	const schema = getSchema(richTextExtensions(profile, { placeholder: 'x' }))
	const profileDef = RICH_TEXT_PROFILES[profile]

	it('узлы и метки схемы редактора = профиль', () => {
		for (const n of profileDef.nodes) expect(schema.nodes[n], n).toBeDefined()
		for (const m of profileDef.marks) expect(schema.marks[m], m).toBeDefined()
		const extraNodes = Object.keys(schema.nodes).filter(
			(n) =>
				!['doc', 'text', 'paragraph', 'listItem', 'taskItem', 'tableRow', 'tableCell', 'tableHeader'].includes(n) &&
				!(profileDef.nodes as readonly string[]).includes(n),
		)
		expect(extraNodes).toEqual([])
		expect(Object.keys(schema.marks).filter((m) => !(profileDef.marks as readonly string[]).includes(m))).toEqual([])
	})

	it('документ из редактора проходит валидатор', () => {
		const content = [
			...profileDef.nodes.map((n) => samples[n]),
			p(...profileDef.marks.map((m) => t(m, [markSamples[m] ?? { type: m }]))),
		]
		const json = Node.fromJSON(schema, { type: 'doc', content }).toJSON()
		expect(richTextIssues(json, profile)).toEqual([])
	})
})
