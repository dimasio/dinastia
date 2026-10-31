// Реестр типов вопросов (скилл question-types): контракт defineQuestion, сверка с общими таблицами, согласованность
// реестров, просмотр single_choice.
import { emptyDoc, RichText } from '@dinastia/contracts/common'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import questionsI18n from '../../i18n/locales/ru/questions.json' with { type: 'json' }
import { defineQuestion, questionDefIssues } from './define.ts'
import { clientQuestions } from './registry.client.ts'
import { questionTypes } from './registry.ts'
import { singleChoice } from './single_choice/definition.ts'
import SingleChoiceViewer from './single_choice/viewer.tsx'

const common = { prompt: RichText, explanation: RichText.nullable(), points: z.number() }
const base = {
	type: 'probe_q',
	uses: { columns: [] as const, items: [] as const },
	schema: z.object(common),
	defaults: () => ({}),
	example: () => ({ prompt: emptyDoc(), explanation: null, points: 1 }),
	secretKeys: [] as const,
	toPublic: (d: object) => d,
	responseSchema: z.object({}),
	grade: () => ({ score: 0, max: 1, isCorrect: false }),
	review: () => null,
	shuffle: false as const,
}

describe('defineQuestion', () => {
	it.each([
		['тип не snake_case', { ...base, type: 'ProbeQ' }, 'snake_case'],
		['нет grade и не manual', { ...base, grade: undefined }, 'нужен grade'],
		[
			'нет общего поля',
			{ ...base, schema: z.object({ prompt: RichText, points: z.number() }) },
			'нет общего поля explanation',
		],
		[
			'колонка типа без uses',
			{ ...base, schema: z.object({ ...common, numberAnswer: z.number() }) },
			'нет в uses.columns',
		],
		['поле не колонка', { ...base, schema: z.object({ ...common, color: z.string() }) }, 'поле color не колонка'],
		[
			'поле элемента не колонка вида',
			{
				...base,
				uses: { columns: [], items: ['accepted_text'] },
				items: { answers: 'accepted_text' },
				schema: z.object({ ...common, answers: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })) }),
			},
			'поле isCorrect не колонка вида accepted_text',
		],
		['example не по схеме', { ...base, example: () => ({ prompt: emptyDoc(), points: 'x' }) }, 'example()'],
		[
			'toPublic оставил секрет',
			{
				...base,
				secretKeys: ['explanation'],
				example: () => ({ prompt: emptyDoc(), explanation: emptyDoc(), points: 1 }),
			},
			'не убирает explanation',
		],
	])('%s — ошибка при объявлении', (_n, def, message) => {
		expect(() => defineQuestion(def as never)).toThrow(message)
	})

	it('ручная проверка — без grade', () => {
		expect(() => defineQuestion({ ...base, grade: undefined, manual: true } as never)).not.toThrow()
	})
})

describe('реестры согласованы', () => {
	it('у каждого типа: ключ = type, сверка с таблицами, клиентские компоненты, строки', () => {
		const types = Object.keys(questionTypes).sort()
		expect(Object.keys(clientQuestions).sort()).toEqual(types)
		for (const [key, def] of Object.entries(questionTypes)) {
			expect(def.type, 'ключ реестра = type').toBe(key)
			expect(questionDefIssues(def), key).toEqual([])
			const s = (questionsI18n as Record<string, { title?: string; description?: string }>)[key]
			expect(s?.title, `questions:${key}.title`).toBeTruthy()
			expect(s?.description, `questions:${key}.description`).toBeTruthy()
		}
	})
})

describe('single_choice', () => {
	const ex = singleChoice.example()
	const [three, four] = ex.options

	it('проверка: верный, неверный, пустой ответ', () => {
		expect(singleChoice.grade?.(ex, { selected: four?.id ?? null })).toEqual({ score: 2, max: 2, isCorrect: true })
		expect(singleChoice.grade?.(ex, { selected: three?.id ?? null })).toEqual({ score: 0, max: 2, isCorrect: false })
		expect(singleChoice.grade?.(ex, { selected: null })).toEqual({ score: 0, max: 2, isCorrect: false })
	})

	it('заготовка редактора проходит схему; без верного — NEED_ONE_CORRECT', () => {
		expect(singleChoice.schema.safeParse(singleChoice.defaults()).success).toBe(true)
		const r = singleChoice.schema.safeParse({ ...ex, options: ex.options.map((o) => ({ ...o, isCorrect: false })) })
		expect(r.error?.issues[0]?.message).toBe('NEED_ONE_CORRECT')
	})

	it('просмотр: в попытке нет отметки верного; в разборе — верный вариант и пояснение', () => {
		const pub = singleChoice.toPublic(ex)
		const attempt = renderToStaticMarkup(<SingleChoiceViewer testId="q" data={pub} response={null} />)
		expect(attempt).not.toContain('data-correct')
		expect(attempt).toContain('Сколько будет 2 + 2?')
		const review = renderToStaticMarkup(
			<SingleChoiceViewer
				testId="q"
				data={pub}
				response={{ selected: three?.id ?? null }}
				review={singleChoice.review(ex)}
			/>,
		)
		expect(review.match(/data-correct="true"/g)).toHaveLength(1)
		expect(review.match(/data-wrong-choice="true"/g)).toHaveLength(1) // выбран «3»
		expect(review).toContain('Два плюс два — четыре.')
		const noExplanation = renderToStaticMarkup(
			<SingleChoiceViewer
				testId="q"
				data={pub}
				response={null}
				review={singleChoice.review({ ...ex, explanation: emptyDoc() })}
			/>,
		)
		expect(noExplanation).not.toContain('q-explanation') // пустое пояснение не показываем
	})
})
