// Форматированный текст (скилл rich-text, D-010): документ Tiptap/ProseMirror в JSON. Профиль — одна точка правды:
// отсюда строятся валидатор (сервер и клиент) и расширения редактора (packages/ui/src/rich-text). Неизвестный узел,
// метка или атрибут — ошибка, а не «молча удалить».
import { z } from 'zod'

export type RichTextProfile = 'lesson' | 'compact' | 'comment'

/** Узел документа: тип, атрибуты, дети; у текста — `text` и метки. */
export interface RichTextNode {
	type: string
	attrs?: Record<string, unknown>
	content?: RichTextNode[]
	text?: string
	marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface RichTextDoc {
	type: 'doc'
	content?: RichTextNode[]
}

/** Цвета текста — токены темы (`.rt-color-<ключ>` в UI), в письмах — эти значения. */
export const RICH_TEXT_COLORS = {
	gray: '#6b7280',
	red: '#dc2626',
	orange: '#ea580c',
	green: '#16a34a',
	blue: '#2563eb',
	purple: '#9333ea',
} as const
export type RichTextColor = keyof typeof RICH_TEXT_COLORS

export const HEADING_LEVELS = [2, 3, 4] as const
export const RICH_TEXT_MAX_BYTES = 512 * 1024
const MAX_DEPTH = 24

/** Узлы и метки, которые профиль разрешает (служебные doc, text, paragraph и дети списков/таблиц — всегда с родителем). */
export const RICH_TEXT_PROFILES = {
	lesson: {
		nodes: [
			'heading',
			'bulletList',
			'orderedList',
			'taskList',
			'blockquote',
			'codeBlock',
			'image',
			'table',
			'horizontalRule',
			'hardBreak',
		],
		marks: ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight', 'textStyle'],
	},
	compact: {
		nodes: ['bulletList', 'orderedList', 'image', 'codeBlock', 'hardBreak'],
		marks: ['bold', 'italic', 'code', 'link'],
	},
	comment: {
		nodes: ['bulletList', 'orderedList', 'codeBlock', 'hardBreak'],
		marks: ['bold', 'italic', 'code', 'link'],
	},
} as const satisfies Record<RichTextProfile, { nodes: readonly string[]; marks: readonly string[] }>

export type RichTextNodeType = (typeof RICH_TEXT_PROFILES)['lesson']['nodes'][number]
export type RichTextMarkType = (typeof RICH_TEXT_PROFILES)['lesson']['marks'][number]

/** Ссылки — только эти протоколы (никаких javascript:, data:). */
export function isAllowedHref(href: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: управляющие символы в ссылке запрещены
	return /^(?:https?:\/\/[^\s/]|mailto:)[^\s\u0000-\u001f]*$/i.test(href)
}

// ── проверка ────────────────────────────────────────────────────────────────

type AttrCheck = (v: unknown) => boolean
const nullable =
	(check: AttrCheck): AttrCheck =>
	(v) =>
		v === null || check(v)
const posInt: AttrCheck = (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1000
const uuid: AttrCheck = (v) => z.uuid().safeParse(v).success
const shortText =
	(max: number): AttrCheck =>
	(v) =>
		typeof v === 'string' && v.length <= max

/** Дети узла: блоки, строчные узлы, текст без меток или конкретные типы. */
type Content = 'blocks' | 'inline' | 'plain' | 'none' | readonly string[]

interface NodeSpec {
	content: Content
	attrs?: Record<string, AttrCheck>
	/** Строчный узел (внутри абзаца). */
	inline?: boolean
}

const NODES: Record<string, NodeSpec> = {
	paragraph: { content: 'inline' },
	heading: { content: 'inline', attrs: { level: (v) => (HEADING_LEVELS as readonly unknown[]).includes(v) } },
	bulletList: { content: ['listItem'] },
	orderedList: {
		content: ['listItem'],
		attrs: { start: (v) => Number.isInteger(v) && (v as number) >= 0, type: nullable(shortText(2)) },
	},
	listItem: { content: 'blocks' },
	taskList: { content: ['taskItem'] },
	taskItem: { content: 'blocks', attrs: { checked: (v) => typeof v === 'boolean' } },
	blockquote: { content: 'blocks' },
	codeBlock: {
		content: 'plain',
		attrs: { language: nullable((v) => typeof v === 'string' && /^[^<>"'\s]{1,50}$/.test(v)) },
	},
	image: { content: 'none', attrs: { fileId: uuid, alt: nullable(shortText(500)) } },
	table: { content: ['tableRow'] },
	tableRow: { content: ['tableCell', 'tableHeader'] },
	tableCell: { content: 'blocks', attrs: cellAttrs() },
	tableHeader: { content: 'blocks', attrs: cellAttrs() },
	horizontalRule: { content: 'none' },
	hardBreak: { content: 'none', inline: true },
}

function cellAttrs(): Record<string, AttrCheck> {
	return {
		colspan: posInt,
		rowspan: posInt,
		colwidth: nullable((v) => Array.isArray(v) && v.every(posInt)),
		align: nullable((v) => v === 'left' || v === 'center' || v === 'right'),
	}
}

/** Дети списков и таблиц разрешены вместе с родителем. */
const IMPLIED: Record<string, string[]> = {
	bulletList: ['listItem'],
	orderedList: ['listItem'],
	taskList: ['taskItem'],
	table: ['tableRow', 'tableCell', 'tableHeader'],
}

const MARKS: Record<string, Record<string, AttrCheck>> = {
	bold: {},
	italic: {},
	underline: {},
	strike: {},
	code: {},
	highlight: {},
	// target/rel/class редактор кладёт сам; рендер ставит свои — значения ни на что не влияют
	link: {
		href: (v) => typeof v === 'string' && v.length <= 2000 && isAllowedHref(v),
		target: nullable(shortText(20)),
		rel: nullable(shortText(100)),
		class: nullable(shortText(100)),
		title: nullable(shortText(500)),
	},
	textStyle: { color: nullable((v) => typeof v === 'string' && v in RICH_TEXT_COLORS) },
}

const REQUIRED_ATTRS: Record<string, string[]> = { image: ['fileId'], link: ['href'], heading: ['level'] }

function profileSets(profile: RichTextProfile) {
	const p = RICH_TEXT_PROFILES[profile]
	const nodes = new Set<string>(['paragraph', ...p.nodes, ...p.nodes.flatMap((n) => IMPLIED[n] ?? [])])
	return { nodes, marks: new Set<string>(p.marks) }
}

/** Ошибки документа по профилю: `[путь, сообщение]`; пусто — документ допустим. */
export function richTextIssues(
	doc: unknown,
	profile: RichTextProfile,
): { path: (string | number)[]; message: string }[] {
	const issues: { path: (string | number)[]; message: string }[] = []
	const allowed = profileSets(profile)
	const add = (path: (string | number)[], message: string) => {
		if (issues.length < 20) issues.push({ path, message })
	}
	const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

	function checkAttrs(
		path: (string | number)[],
		kind: string,
		attrs: unknown,
		spec: Record<string, AttrCheck> | undefined,
	) {
		const required = REQUIRED_ATTRS[kind] ?? []
		if (attrs === undefined) {
			if (required.length) add(path, `${kind}: нет атрибутов ${required.join(', ')}`)
			return
		}
		if (!isObj(attrs)) return add([...path, 'attrs'], `${kind}: attrs — объект`)
		for (const [k, v] of Object.entries(attrs)) {
			const check = spec?.[k]
			if (!check) add([...path, 'attrs', k], `${kind}: атрибут «${k}» не разрешён`)
			else if (v !== undefined && !check(v)) add([...path, 'attrs', k], `${kind}: недопустимое значение «${k}»`)
		}
		for (const k of required)
			if (attrs[k] === undefined || attrs[k] === null) add([...path, 'attrs', k], `${kind}: нет «${k}»`)
	}

	function checkNode(node: unknown, path: (string | number)[], parent: Content, depth: number) {
		if (depth > MAX_DEPTH) return add(path, 'слишком глубокая вложенность')
		if (!isObj(node) || typeof node.type !== 'string') return add(path, 'узел без типа')
		const known = new Set(['type', 'attrs', 'content', 'text', 'marks'])
		for (const k of Object.keys(node)) if (!known.has(k)) add([...path, k], `поле «${k}» не разрешено`)

		if (node.type === 'text') {
			if (parent !== 'inline' && parent !== 'plain') return add(path, 'текст вне абзаца')
			if (typeof node.text !== 'string' || node.text.length === 0) add([...path, 'text'], 'пустой текст')
			if (node.marks === undefined) return
			if (parent === 'plain') return add([...path, 'marks'], 'в блоке кода метки не разрешены')
			if (!Array.isArray(node.marks)) return add([...path, 'marks'], 'marks — массив')
			for (const [i, m] of node.marks.entries()) {
				const mp = [...path, 'marks', i]
				if (!isObj(m) || typeof m.type !== 'string') add(mp, 'метка без типа')
				else if (!allowed.marks.has(m.type)) add(mp, `метка «${m.type}» не разрешена в профиле ${profile}`)
				else checkAttrs(mp, m.type, m.attrs, MARKS[m.type])
			}
			return
		}

		const spec = NODES[node.type]
		if (!spec || !allowed.nodes.has(node.type)) return add(path, `узел «${node.type}» не разрешён в профиле ${profile}`)
		const fits =
			parent === 'blocks'
				? !spec.inline && !IMPLIED_CHILD.has(node.type)
				: parent === 'inline'
					? spec.inline === true
					: Array.isArray(parent) && parent.includes(node.type)
		if (!fits) add(path, `узел «${node.type}» здесь не допускается`)
		if (node.marks !== undefined) add([...path, 'marks'], 'метки — только у текста')
		if (node.text !== undefined) add([...path, 'text'], 'text — только у текстового узла')
		checkAttrs(path, node.type, node.attrs, spec.attrs)

		if (node.content === undefined) {
			if (Array.isArray(spec.content) || spec.content === 'blocks') add(path, `${node.type}: нет содержимого`)
			return
		}
		if (spec.content === 'none') return add([...path, 'content'], `${node.type}: без содержимого`)
		if (!Array.isArray(node.content)) return add([...path, 'content'], 'content — массив')
		if ((Array.isArray(spec.content) || spec.content === 'blocks') && node.content.length === 0)
			add([...path, 'content'], `${node.type}: пустое содержимое`)
		for (const [i, c] of node.content.entries()) checkNode(c, [...path, 'content', i], spec.content, depth + 1)
	}

	if (!isObj(doc) || doc.type !== 'doc') return [{ path: [], message: 'не документ' }]
	if (JSON.stringify(doc).length > RICH_TEXT_MAX_BYTES) return [{ path: [], message: 'документ больше 512 КБ' }]
	for (const k of Object.keys(doc)) if (k !== 'type' && k !== 'content') add([k], `поле «${k}» не разрешено`)
	if (doc.content !== undefined) {
		if (!Array.isArray(doc.content)) add(['content'], 'content — массив')
		else for (const [i, c] of doc.content.entries()) checkNode(c, ['content', i], 'blocks', 1)
	}
	return issues
}

const IMPLIED_CHILD = new Set(Object.values(IMPLIED).flat())

/** Профиль rich-text схемы (для формы ресурса: поле со схемой `RichText` получает редактор). */
export const richTextRegistry = z.registry<{ richText: RichTextProfile }>()

/** zod-схема документа профиля: на сервере — 400 INVALID_INPUT с путями ошибок. */
export function richTextSchema(profile: RichTextProfile) {
	const schema = z.custom<RichTextDoc>().superRefine((doc, ctx) => {
		for (const issue of richTextIssues(doc, profile))
			ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
	})
	richTextRegistry.add(schema, { richText: profile })
	return schema
}

export const RichText = richTextSchema('lesson')
export const CompactText = richTextSchema('compact')
export const CommentText = richTextSchema('comment')

export const emptyDoc = (): RichTextDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] })

/**
 * Привести документ к профилю (клиент, до сохранения: вставка из Word/Google Docs, чужие атрибуты): недопустимый
 * узел заменяется своими допустимыми детьми или убирается, недопустимые метки и атрибуты — убираются. Сервер не
 * чистит, а отклоняет (richTextSchema).
 */
export function sanitizeRichText(doc: unknown, profile: RichTextProfile): RichTextDoc {
	const allowed = profileSets(profile)
	const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

	const cleanAttrs = (attrs: unknown, spec: Record<string, AttrCheck> | undefined) => {
		if (!isObj(attrs) || !spec) return undefined
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(attrs)) if (spec[k] && v !== undefined && spec[k](v)) out[k] = v
		return Object.keys(out).length ? out : undefined
	}

	const fits = (type: string, parent: Content) => {
		const spec = NODES[type]
		if (type === 'text') return parent === 'inline' || parent === 'plain'
		if (!spec || !allowed.nodes.has(type)) return false
		if (parent === 'blocks') return !spec.inline && !IMPLIED_CHILD.has(type)
		if (parent === 'inline') return spec.inline === true
		return Array.isArray(parent) && parent.includes(type)
	}

	function clean(node: unknown, parent: Content, depth: number): RichTextNode[] {
		if (!isObj(node) || typeof node.type !== 'string' || depth > MAX_DEPTH) return []
		if (node.type === 'text') {
			if (typeof node.text !== 'string' || node.text === '') return []
			if (parent === 'blocks') return [{ type: 'paragraph', content: [{ type: 'text', text: node.text }] }]
			if (parent !== 'inline' && parent !== 'plain') return []
			const marks =
				parent === 'plain' || !Array.isArray(node.marks)
					? []
					: node.marks.flatMap((m: unknown) => {
							if (!isObj(m) || typeof m.type !== 'string' || !allowed.marks.has(m.type)) return []
							const attrs = cleanAttrs(m.attrs, MARKS[m.type])
							if ((REQUIRED_ATTRS[m.type] ?? []).some((k) => attrs?.[k] == null)) return []
							return [{ type: m.type, ...(attrs ? { attrs } : {}) }]
						})
			return [{ type: 'text', text: node.text, ...(marks.length ? { marks } : {}) }]
		}
		const children = Array.isArray(node.content) ? node.content : []
		if (!fits(node.type, parent)) {
			// не подходит сюда — пробуем его содержимое на этом месте (заголовок h1 → текст, неизвестный блок → абзацы)
			const lifted = children.flatMap((c) => clean(c, parent, depth + 1))
			if (parent === 'blocks' && lifted.length === 0) {
				const inline = children.flatMap((c) => clean(c, 'inline', depth + 1))
				return inline.length ? [{ type: 'paragraph', content: inline }] : []
			}
			return lifted
		}
		const spec = NODES[node.type] as NodeSpec
		let attrs = cleanAttrs(node.attrs, spec.attrs)
		if ((REQUIRED_ATTRS[node.type] ?? []).some((k) => attrs?.[k] == null)) {
			if (node.type !== 'heading') return []
			attrs = { ...attrs, level: 2 }
		}
		const out: RichTextNode = { type: node.type, ...(attrs ? { attrs } : {}) }
		if (spec.content === 'none') return [out]
		let content = children.flatMap((c) => clean(c, spec.content, depth + 1))
		if (spec.content === 'blocks' && content.length === 0) content = [{ type: 'paragraph' }]
		if (Array.isArray(spec.content) && content.length === 0) return []
		return [{ ...out, ...(content.length ? { content } : {}) }]
	}

	const content = isObj(doc) && Array.isArray(doc.content) ? doc.content.flatMap((c) => clean(c, 'blocks', 1)) : []
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

// ── утилиты ─────────────────────────────────────────────────────────────────

const BLOCKS = new Set([
	'paragraph',
	'heading',
	'codeBlock',
	'listItem',
	'taskItem',
	'blockquote',
	'tableCell',
	'tableHeader',
])

/** Текст без разметки: превью в списках, поиск. Блоки — через перевод строки. */
export function toPlainText(doc: RichTextDoc | null | undefined, opts: { maxLength?: number } = {}): string {
	const out: string[] = []
	const walk = (n: RichTextNode) => {
		if (n.type === 'text') out.push(n.text ?? '')
		else if (n.type === 'hardBreak') out.push('\n')
		else if (n.type === 'image' && typeof n.attrs?.alt === 'string') out.push(n.attrs.alt)
		for (const c of n.content ?? []) walk(c)
		if (BLOCKS.has(n.type)) out.push('\n')
	}
	for (const n of doc?.content ?? []) walk(n)
	const text = out
		.join('')
		.replace(/[ \t]*\n[\s]*/g, '\n')
		.trim()
	const max = opts.maxLength
	if (max === undefined || text.length <= max) return text
	return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** В документе нет ни текста, ни картинок, ни таблиц — «пусто» для обязательного поля. */
export function isEmptyDoc(doc: RichTextDoc | null | undefined): boolean {
	const has = (n: RichTextNode): boolean =>
		(n.type === 'text' && (n.text ?? '').trim() !== '') ||
		n.type === 'image' ||
		n.type === 'horizontalRule' ||
		(n.content ?? []).some(has)
	return !(doc?.content ?? []).some(has)
}

/** Файлы картинок документа — привязать к сущности, удалить сироты. */
export function collectFileIds(doc: RichTextDoc | null | undefined): string[] {
	const ids = new Set<string>()
	const walk = (n: RichTextNode) => {
		if (n.type === 'image' && typeof n.attrs?.fileId === 'string') ids.add(n.attrs.fileId)
		for (const c of n.content ?? []) walk(c)
	}
	for (const n of doc?.content ?? []) walk(n)
	return [...ids]
}
