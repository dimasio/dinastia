// Форматированный текст для сидов (скилл rich-text): короткие конструкторы документа Tiptap.
import type { RichTextDoc } from '@dinastia/contracts/common'

type Node = Record<string, unknown>
type Inline = string | Node

const txt = (text: string, marks: string[] = []) =>
	marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text }

/** Жирный фрагмент абзаца. */
export const b = (text: string) => txt(text, ['bold'])
/** Курсив. */
export const i = (text: string) => txt(text, ['italic'])

export const p = (...parts: Inline[]): Node => ({
	type: 'paragraph',
	content: parts.map((x) => (typeof x === 'string' ? txt(x) : x)),
})
export const h = (level: 2 | 3, text: string): Node => ({ type: 'heading', attrs: { level }, content: [txt(text)] })

const item = (x: Inline | Inline[]) => ({
	type: 'listItem',
	content: [Array.isArray(x) ? p(...x) : typeof x === 'string' ? p(x) : x],
})
/** Маркированный список; пункт — строка, узел или массив фрагментов абзаца. */
export const ul = (...items: (Inline | Inline[])[]): Node => ({ type: 'bulletList', content: items.map(item) })
export const ol = (...items: (Inline | Inline[])[]): Node => ({
	type: 'orderedList',
	attrs: { start: 1, type: null },
	content: items.map(item),
})
export const quote = (text: string): Node => ({ type: 'blockquote', content: [p(text)] })

const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({
	type,
	attrs: { colspan: 1, rowspan: 1, colwidth: null },
	content: [p(text)],
})
export const table = (head: string[], rows: string[][]): Node => ({
	type: 'table',
	content: [
		{ type: 'tableRow', content: head.map((x) => cell('tableHeader', x)) },
		...rows.map((r) => ({ type: 'tableRow', content: r.map((x) => cell('tableCell', x)) })),
	],
})

export const doc = (...content: Node[]) => ({ type: 'doc', content }) as unknown as RichTextDoc
export const line = (text: string) => doc(p(text))
