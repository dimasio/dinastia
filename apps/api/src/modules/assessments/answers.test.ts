// Соглашение «ответ ↔ строки» (карточка 3.3): туда и обратно для всех типов вопросов; чужие и повторные элементы — отказ.
import { questionTypes } from '@dinastia/questions'
import { describe, expect, it } from 'vitest'
import { AppError } from '#/kernel/errors.ts'
import { decodeResponse, encodeResponse } from './answers.ts'

const id = (n: number) => `0199e3a0-0000-7000-8000-0000000007${String(n).padStart(2, '0')}`
const all = new Set([1, 2, 3, 4].map(id))
const def = (t: keyof typeof questionTypes) => questionTypes[t]
const code = (fn: () => unknown) => {
	try {
		fn()
		return 'ok'
	} catch (e) {
		return e instanceof AppError ? e.code : String(e)
	}
}

describe('ответы: кодирование в строки и обратно', () => {
	it('один вариант и несколько вариантов', () => {
		const one = encodeResponse(def('single_choice'), { selected: id(2) }, all)
		expect(one.items).toEqual([{ itemId: id(2), position: null, matchedItemId: null }])
		expect(decodeResponse(def('single_choice'), one)).toEqual({ selected: id(2) })
		expect(decodeResponse(def('single_choice'), { textValue: null, numberValue: null, items: [] })).toEqual({
			selected: null,
		})
		const many = encodeResponse(def('multiple_choice'), { selected: [id(1), id(3)] }, all)
		expect(decodeResponse(def('multiple_choice'), many)).toEqual({ selected: [id(1), id(3)] })
		expect(decodeResponse(def('multiple_choice'), { textValue: null, numberValue: null, items: [] })).toEqual({
			selected: [],
		})
	})
	it('текст, число, развёрнутый ответ', () => {
		const t = encodeResponse(def('text_input'), { text: 'Париж' }, all)
		expect(t).toMatchObject({ textValue: 'Париж', items: [] })
		expect(decodeResponse(def('text_input'), t)).toEqual({ text: 'Париж' })
		const n = encodeResponse(def('number'), { value: 3.14 }, all)
		expect(n.numberValue).toBe(3.14)
		expect(decodeResponse(def('number'), n)).toEqual({ value: 3.14 })
		expect(decodeResponse(def('number'), encodeResponse(def('number'), { value: null }, all))).toEqual({ value: null })
		expect(decodeResponse(def('open_text'), encodeResponse(def('open_text'), { text: 'Мой ответ' }, all))).toEqual({
			text: 'Мой ответ',
		})
	})
	it('порядок хранит позиции и читается в том же порядке', () => {
		const rows = encodeResponse(def('ordering'), { order: [id(3), id(1), id(2)] }, all)
		expect(rows.items.map((x) => [x.itemId, x.position])).toEqual([
			[id(3), 0],
			[id(1), 1],
			[id(2), 2],
		])
		// строки из БД приходят в любом порядке
		expect(decodeResponse(def('ordering'), { ...rows, items: [...rows.items].reverse() })).toEqual({
			order: [id(3), id(1), id(2)],
		})
	})
	it('пары: левый элемент и выбранный правый', () => {
		const rows = encodeResponse(
			def('matching'),
			{
				pairs: [
					{ left: id(1), right: id(3) },
					{ left: id(2), right: id(4) },
				],
			},
			all,
		)
		expect(rows.items[0]).toEqual({ itemId: id(1), position: null, matchedItemId: id(3) })
		expect(decodeResponse(def('matching'), rows)).toEqual({
			pairs: [
				{ left: id(1), right: id(3) },
				{ left: id(2), right: id(4) },
			],
		})
	})
	it('чужой элемент и повтор — ANSWER_INVALID', () => {
		expect(code(() => encodeResponse(def('single_choice'), { selected: id(9) }, all))).toBe('ANSWER_INVALID')
		expect(code(() => encodeResponse(def('multiple_choice'), { selected: [id(1), id(1)] }, all))).toBe('ANSWER_INVALID')
		expect(code(() => encodeResponse(def('matching'), { pairs: [{ left: id(1), right: id(9) }] }, all))).toBe(
			'ANSWER_INVALID',
		)
	})
	it('нет ответа — null', () => {
		expect(decodeResponse(def('single_choice'), null)).toBeNull()
	})
	it('все типы реестра укладываются в соглашение', () => {
		for (const d of Object.values(questionTypes))
			expect(() => decodeResponse(d, { textValue: null, numberValue: null, items: [] })).not.toThrow()
	})
})
