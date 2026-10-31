import { describe, expect, it } from 'vitest'
import { toHtml } from '../rich-text/server.ts'
import {
	CommentText,
	collectFileIds,
	isEmptyDoc,
	RichText,
	type RichTextDoc,
	richTextIssues,
	sanitizeRichText,
	toPlainText,
} from './rich-text.ts'

const FILE = '0199e3a0-0000-7000-8000-000000000001'
const p = (...content: object[]) => ({ type: 'paragraph', content })
const t = (text: string, marks?: object[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const doc = (...content: object[]) => ({ type: 'doc', content }) as RichTextDoc

/** Документ со всем, что разрешает профиль lesson. */
const full = doc(
	{ type: 'heading', attrs: { level: 2 }, content: [t('Заголовок')] },
	p(
		t('жирный', [{ type: 'bold' }]),
		{ type: 'hardBreak' },
		t('ссылка', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: null, class: null } }]),
		t('цвет', [{ type: 'textStyle', attrs: { color: 'red' } }, { type: 'highlight' }]),
	),
	{ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('пункт'))] }] },
	{ type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [p(t('три'))] }] },
	{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('сделано'))] }] },
	{ type: 'blockquote', content: [p(t('цитата'))] },
	{ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1 < 2')] },
	{ type: 'image', attrs: { fileId: FILE, alt: 'схема' } },
	{
		type: 'table',
		content: [
			{
				type: 'tableRow',
				content: [
					{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t('A'))] },
					{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: [120, 80] }, content: [p(t('B'))] },
				],
			},
		],
	},
	{ type: 'horizontalRule' },
)

describe('валидатор профилей', () => {
	it('lesson принимает всё своё; comment — без заголовков, таблиц, картинок и цвета', () => {
		expect(richTextIssues(full, 'lesson')).toEqual([])
		const messages = richTextIssues(full, 'comment').map((i) => i.message)
		expect(messages).toEqual(
			expect.arrayContaining([
				'узел «heading» не разрешён в профиле comment',
				'узел «table» не разрешён в профиле comment',
				'узел «image» не разрешён в профиле comment',
				'метка «textStyle» не разрешена в профиле comment',
			]),
		)
	})

	it.each([
		['javascript: в ссылке', doc(p(t('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))],
		['data: в ссылке', doc(p(t('x', [{ type: 'link', attrs: { href: 'data:text/html,<b>' } }])))],
		['внешняя картинка', doc({ type: 'image', attrs: { src: 'https://evil.example/x.png' } })],
		['картинка без fileId', doc({ type: 'image', attrs: { alt: 'x' } })],
		['неизвестный узел', doc({ type: 'iframe', attrs: { src: 'https://x' } })],
		['неизвестный атрибут', doc({ type: 'paragraph', attrs: { style: 'x' }, content: [] })],
		['заголовок h1', doc({ type: 'heading', attrs: { level: 1 }, content: [t('x')] })],
		['цвет вне палитры', doc(p(t('x', [{ type: 'textStyle', attrs: { color: 'url(x)' } }])))],
		['лишнее поле', doc({ type: 'paragraph', html: '<script>' })],
		['текст в корне', doc(t('x'))],
		['пункт списка вне списка', doc({ type: 'listItem', content: [p(t('x'))] })],
		['метки в коде', doc({ type: 'codeBlock', content: [t('x', [{ type: 'bold' }])] })],
		['пустой список', doc({ type: 'bulletList', content: [] })],
		['не документ', { type: 'paragraph' }],
		['слишком большой', doc(p(t('я'.repeat(600 * 1024))))],
	])('отказ: %s', (_name, value) => {
		expect(richTextIssues(value, 'lesson').length).toBeGreaterThan(0)
		expect(RichText.safeParse(value).success).toBe(false)
	})

	it('схема zod: ошибки с путём до узла', () => {
		const r = CommentText.safeParse(doc(p(t('ok')), { type: 'heading', attrs: { level: 2 }, content: [t('x')] }))
		expect(r.success).toBe(false)
		expect(r.error?.issues[0]?.path).toEqual(['content', 1])
	})

	it('слишком глубокая вложенность — отказ, а не переполнение стека', () => {
		let node: object = p(t('x'))
		for (let i = 0; i < 40; i++) node = { type: 'blockquote', content: [node] }
		expect(richTextIssues(doc(node), 'lesson').map((i) => i.message)).toContain('слишком глубокая вложенность')
	})
})

describe('очистка вставки', () => {
	it('приводит чужое к профилю: лишнее снимается, текст остаётся', () => {
		const dirty = doc(
			{ type: 'heading', attrs: { level: 1 }, content: [t('Заголовок h1')] },
			{
				type: 'paragraph',
				attrs: { style: 'color:red' },
				content: [t('x', [{ type: 'link', attrs: { href: 'javascript:1' } }])],
			},
			{ type: 'image', attrs: { src: 'https://evil.example/x.png' } },
			{ type: 'iframe', content: [p(t('внутри'))] },
			p(t('цвет', [{ type: 'textStyle', attrs: { color: 'rgb(1,2,3)' } }])),
		)
		const clean = sanitizeRichText(dirty, 'comment')
		expect(richTextIssues(clean, 'comment')).toEqual([])
		expect(toPlainText(clean)).toBe('Заголовок h1\nx\nвнутри\nцвет')
		expect(richTextIssues(sanitizeRichText(full, 'lesson'), 'lesson')).toEqual([])
		expect(sanitizeRichText(full, 'lesson')).toEqual(full)
		expect(sanitizeRichText(null, 'lesson')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
	})
})

describe('утилиты', () => {
	it('toPlainText, isEmptyDoc, collectFileIds', () => {
		expect(toPlainText(full, { maxLength: 20 })).toBe('Заголовок\nжирный\nсс…')
		expect(toPlainText(doc(p(t('a'), { type: 'hardBreak' }, t('b'))))).toBe('a\nb')
		expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true)
		expect(isEmptyDoc(doc(p(t('  '))))).toBe(true)
		expect(isEmptyDoc(doc({ type: 'image', attrs: { fileId: FILE } }))).toBe(false)
		expect(isEmptyDoc(full)).toBe(false)
		expect(collectFileIds(full)).toEqual([FILE])
	})
})

describe('toHtml', () => {
	it('экранирует текст и атрибуты, ссылки — с rel, картинки — через resolveFile', () => {
		const html = toHtml(
			doc(
				p(t('<script>alert(1)</script>')),
				p(t('ссылка', [{ type: 'link', attrs: { href: 'https://e.com/?a="><img/src=x/onerror=1>' } }])),
				{ type: 'image', attrs: { fileId: FILE, alt: '" onload="x' } },
			),
			{ resolveFile: (id) => (id === FILE ? 'https://files.example/a.png' : null) },
		)
		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
		expect(html).toContain('href="https://e.com/?a=&quot;&gt;&lt;img/src=x/onerror=1&gt;"')
		expect(html).toContain('rel="noopener noreferrer nofollow"')
		expect(html).toContain('<img src="https://files.example/a.png" alt="&quot; onload=&quot;x"')
		expect(html).not.toMatch(/<img[^>]+onerror/)
	})

	it('весь профиль lesson; картинка без ссылки — пропущена', () => {
		const html = toHtml(full)
		for (const tag of [
			'<h2>',
			'<strong>',
			'<br>',
			'<ul>',
			'<ol start="3">',
			'☑',
			'<blockquote>',
			'<pre><code>',
			'<table>',
			'<td colspan="2">',
			'<hr>',
		])
			expect(html).toContain(tag)
		expect(html).toContain('<span style="color:#dc2626">')
		expect(html).toContain('const a = 1 &lt; 2')
		expect(html).not.toContain('<img')
	})
})
