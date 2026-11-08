// Ответ ученика ↔ строки таблиц (карточка 3.3, D-032: ответы — реляционно). Соглашение о ключах `responseSchema` типа
// вопроса: `selected` (id или список id) → элементы; `order` (список id) → элементы с позицией; `pairs`
// (`[{ left, right }]`) → элементы с `matched_item_id`; `text` → `text_value`; `value` → `number_value`.
// Тип вопроса с другой формой ответа требует расширения соглашения (запрос к ядру) — `encodeResponse` откажет.
import type { AnyQuestionDef } from '@dinastia/questions'
import { fail } from '#/kernel/errors.ts'

export interface AnswerRows {
	textValue: string | null
	numberValue: number | null
	items: { itemId: string; position: number | null; matchedItemId: string | null }[]
}

type Json = Record<string, unknown>

interface ZDef {
	type: string
	innerType?: unknown
	in?: unknown
}
const defOf = (s: unknown) => (s as { _zod: { def: ZDef } })._zod.def
function unwrap(s: unknown): unknown {
	let cur = s
	for (;;) {
		const d = defOf(cur)
		if (['optional', 'nullable', 'default'].includes(d.type)) cur = d.innerType
		else if (d.type === 'pipe') cur = d.in
		else return cur
	}
}

/** Ключи ответа типа (по схеме); неизвестный ключ — тип вне соглашения. */
const KNOWN = ['selected', 'order', 'pairs', 'text', 'value']

function shapeOf(def: AnyQuestionDef): Record<string, unknown> {
	const shape = (def.responseSchema as unknown as { shape?: Record<string, unknown> }).shape
	if (!shape) throw new Error(`вопрос «${def.type}»: ответ не объект`)
	for (const k of Object.keys(shape))
		if (!KNOWN.includes(k)) throw new Error(`вопрос «${def.type}»: ключ ответа «${k}» вне соглашения (answers.ts)`)
	return shape
}

/** Ответ (уже проверенный `responseSchema`) → строки; `allowed` — id элементов вопроса из снимка попытки. */
export function encodeResponse(def: AnyQuestionDef, response: unknown, allowed: ReadonlySet<string>): AnswerRows {
	shapeOf(def)
	const r = response as Json
	const rows: AnswerRows = { textValue: null, numberValue: null, items: [] }
	const item = (id: unknown, position: number | null = null, matched: unknown = null) => {
		if (typeof id !== 'string' || !allowed.has(id) || (matched !== null && !allowed.has(matched as string)))
			return fail.invalid('ANSWER_INVALID')
		rows.items.push({ itemId: id, position, matchedItemId: (matched as string | null) ?? null })
	}
	if ('selected' in r)
		for (const id of Array.isArray(r.selected) ? r.selected : r.selected === null ? [] : [r.selected]) item(id)
	if ('order' in r) for (const [i, id] of (r.order as unknown[]).entries()) item(id, i)
	if ('pairs' in r) for (const p of r.pairs as { left: string; right: string }[]) item(p.left, null, p.right)
	if ('text' in r) rows.textValue = r.text as string
	if ('value' in r) rows.numberValue = (r.value as number | null) ?? null
	// повторы одного элемента (кроме порядка) — подделка
	const ids = rows.items.map((x) => x.itemId)
	if (new Set(ids).size !== ids.length) return fail.invalid('ANSWER_INVALID')
	return rows
}

/** Строки → ответ в форме `responseSchema` типа; нет строки ответа — `null`. */
export function decodeResponse(def: AnyQuestionDef, rows: AnswerRows | null): unknown {
	if (!rows) return null
	const shape = shapeOf(def)
	const out: Json = {}
	const byPos = [...rows.items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	if ('selected' in shape)
		out.selected =
			defOf(unwrap(shape.selected)).type === 'array' ? rows.items.map((x) => x.itemId) : (rows.items[0]?.itemId ?? null)
	if ('order' in shape) out.order = byPos.map((x) => x.itemId)
	if ('pairs' in shape)
		out.pairs = rows.items.flatMap((x) => (x.matchedItemId ? [{ left: x.itemId, right: x.matchedItemId }] : []))
	if ('text' in shape) out.text = rows.textValue ?? ''
	if ('value' in shape) out.value = rows.numberValue
	return out
}
