// Типы вопросов 3.2 (скилл question-types, карточка 3.2): проверка (верный, неверный, частичный, пустой ответ), схема
// (коды ошибок), toPublic без секретов, детерминированный порядок, подстановки текстового ввода, отрисовка.
import { emptyDoc } from '@dinastia/contracts/common'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { matchesPattern, normalizeText, shuffled } from './common.ts'
import { matching } from './matching/definition.ts'
import MatchingViewer from './matching/viewer.tsx'
import { multipleChoice } from './multiple_choice/definition.ts'
import MultipleChoiceViewer from './multiple_choice/viewer.tsx'
import { number } from './number/definition.ts'
import NumberViewer, { parseNumber } from './number/viewer.tsx'
import { openText } from './open_text/definition.ts'
import { ordering } from './ordering/definition.ts'
import OrderingViewer from './ordering/viewer.tsx'
import { questionTypes } from './registry.ts'
import { singleChoice } from './single_choice/definition.ts'
import { textInput } from './text_input/definition.ts'
import TextInputViewer from './text_input/viewer.tsx'

const codes = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? []

describe('реестр', () => {
	it('семь встроенных типов; у каждого пример проходит схему и toPublic убирает секреты', () => {
		// встроенные — на месте; новые типы добавляет `pnpm gen:question`, и список их не ломает (как у блоков)
		expect(Object.keys(questionTypes)).toEqual(
			expect.arrayContaining([
				'matching',
				'multiple_choice',
				'number',
				'open_text',
				'ordering',
				'single_choice',
				'text_input',
			]),
		)
		for (const def of Object.values(questionTypes)) expect(def.schema.safeParse(def.example()).success).toBe(true)
	})

	it('пустая формулировка — PROMPT_REQUIRED для всех типов; заготовка редактора схему не проходит', () => {
		for (const def of Object.values(questionTypes)) {
			const r = def.schema.safeParse({ ...def.example(), prompt: emptyDoc() })
			expect(codes(r)).toContain('PROMPT_REQUIRED')
			expect(def.schema.safeParse(def.defaults()).success).toBe(false)
		}
	})
})

describe('multiple_choice', () => {
	const q = multipleChoice.example() // верные: 2 и 7; неверные: 4 и 9; 4 балла, partial
	const [a, b, c, d] = q.options.map((o) => o.id as string) as [string, string, string, string]
	const grade = (selected: string[], scoring: 'all_or_nothing' | 'partial' = q.scoring) =>
		multipleChoice.grade?.({ ...q, scoring }, { selected })

	it('все верные и только они — полный балл', () => {
		expect(grade([a, c])).toEqual({ score: 4, max: 4, isCorrect: true })
		expect(grade([c, a, a])).toMatchObject({ score: 4, isCorrect: true }) // повтор не мешает
	})
	it('частичный: верные минус лишние; не ниже нуля', () => {
		expect(grade([a])).toEqual({ score: 2, max: 4, isCorrect: false })
		expect(grade([a, b])).toEqual({ score: 0, max: 4, isCorrect: false }) // 1 верный − 1 лишний
		expect(grade([a, c, b])).toEqual({ score: 2, max: 4, isCorrect: false })
		expect(grade([b, d])).toMatchObject({ score: 0 })
		expect(grade([])).toMatchObject({ score: 0, isCorrect: false })
	})
	it('всё или ничего: любая ошибка — ноль', () => {
		expect(grade([a], 'all_or_nothing')).toMatchObject({ score: 0 })
		expect(grade([a, c, d], 'all_or_nothing')).toMatchObject({ score: 0 })
		expect(grade([a, c], 'all_or_nothing')).toMatchObject({ score: 4 })
	})
	it('схема: нужен хотя бы один верный и один неверный', () => {
		const none = { ...q, options: q.options.map((o) => ({ ...o, isCorrect: false })) }
		const all = { ...q, options: q.options.map((o) => ({ ...o, isCorrect: true })) }
		expect(codes(multipleChoice.schema.safeParse(none))).toContain('NEED_CORRECT')
		expect(codes(multipleChoice.schema.safeParse(all))).toContain('NEED_INCORRECT')
	})
	it('пустой вариант — OPTION_REQUIRED; ученику не уходят isCorrect и пояснение', () => {
		const empty = { ...q, options: q.options.map((o, i) => (i === 0 ? { ...o, body: emptyDoc() } : o)) }
		expect(codes(multipleChoice.schema.safeParse(empty))).toContain('OPTION_REQUIRED')
		expect(JSON.stringify(multipleChoice.toPublic(q))).not.toMatch(/isCorrect|explanation/)
	})
	it('просмотр: в попытке нет отметок верного, в разборе — верные и выбранный неверный', () => {
		const pub = multipleChoice.toPublic(q)
		const attempt = renderToStaticMarkup(
			<MultipleChoiceViewer testId="q" data={pub} response={null} onChange={() => {}} />,
		)
		expect(attempt).not.toContain('data-correct')
		const review = renderToStaticMarkup(
			<MultipleChoiceViewer testId="q" data={pub} response={{ selected: [a, b] }} review={multipleChoice.review(q)} />,
		)
		expect(review.match(/data-correct="true"/g)).toHaveLength(2)
		expect(review.match(/data-wrong-choice="true"/g)).toHaveLength(1)
	})
})

describe('text_input', () => {
	const q = textInput.example() // «Париж», «г. Париж», «Париж*», без учёта регистра
	const grade = (text: string, over: Partial<typeof q> = {}) => textInput.grade?.({ ...q, ...over }, { text })

	it('нормализация: регистр, пробелы по краям и внутри, ё = е', () => {
		expect(grade('  париж ')).toMatchObject({ isCorrect: true, score: 1 })
		expect(grade('Г.   ПАРИЖ')).toMatchObject({ isCorrect: true })
		expect(normalizeText('  Ёлка   Зелёная ', false)).toBe('елка зеленая')
		expect(grade('Лондон')).toMatchObject({ isCorrect: false, score: 0 })
	})
	it('регистр по настройке', () => {
		const strict = { caseSensitive: true, accepted: [{ text: 'Париж' }] }
		expect(grade('париж', strict)).toMatchObject({ isCorrect: false })
		expect(grade('Париж', strict)).toMatchObject({ isCorrect: true })
	})
	it('шаблон: * и ?, без регулярных выражений', () => {
		expect(grade('Париж — столица')).toMatchObject({ isCorrect: true }) // «Париж*»
		const p = { accepted: [{ text: 'к?т' }] }
		expect(grade('кот', p)).toMatchObject({ isCorrect: true })
		expect(grade('кит', p)).toMatchObject({ isCorrect: true })
		expect(grade('кто', p)).toMatchObject({ isCorrect: false })
		expect(grade('к.т', { accepted: [{ text: 'к.т' }] })).toMatchObject({ isCorrect: true }) // точка — просто точка
		expect(grade('кот', { accepted: [{ text: 'к.т' }] })).toMatchObject({ isCorrect: false })
		expect(matchesPattern('a*b*c', 'axxbxxc')).toBe(true)
		expect(matchesPattern('a*b*c', 'axxbxx')).toBe(false)
		expect(matchesPattern('*', '')).toBe(true)
		expect(matchesPattern('?', '')).toBe(false)
	})
	it('пустой ответ неверен, даже если шаблон «*» принимает всё', () => {
		expect(grade('', { accepted: [{ text: '*' }] })).toMatchObject({ isCorrect: false })
		expect(grade('   ')).toMatchObject({ isCorrect: false })
	})
	it('схема: допустимый ответ не пустой; ученику допустимые не уходят', () => {
		expect(codes(textInput.schema.safeParse({ ...q, accepted: [{ text: '  ' }] }))).toContain('ANSWER_REQUIRED')
		expect(JSON.stringify(textInput.toPublic(q))).not.toMatch(/accepted|Париж|explanation/)
	})
	it('просмотр: разбор показывает допустимые ответы', () => {
		const pub = textInput.toPublic(q)
		expect(
			renderToStaticMarkup(<TextInputViewer testId="q" data={pub} response={null} onChange={() => {}} />),
		).not.toContain('Париж*')
		expect(
			renderToStaticMarkup(
				<TextInputViewer testId="q" data={pub} response={{ text: 'Лион' }} review={textInput.review(q)} />,
			),
		).toContain('Париж*')
	})
})

describe('number', () => {
	const q = number.example() // 3,14 ± 0,005
	const grade = (value: number | null, over: Partial<typeof q> = {}) => number.grade?.({ ...q, ...over }, { value })

	it('в пределах допуска — верно, за пределами — нет, пустой — нет', () => {
		expect(grade(3.14)).toMatchObject({ isCorrect: true, score: 2 })
		expect(grade(3.145)).toMatchObject({ isCorrect: true }) // граница допуска
		expect(grade(3.15)).toMatchObject({ isCorrect: false, score: 0 })
		expect(grade(null)).toMatchObject({ isCorrect: false, score: 0 })
	})
	it('допуск 0 — точное совпадение; отрицательные числа', () => {
		expect(grade(7, { numberAnswer: 7, numberTolerance: 0 })).toMatchObject({ isCorrect: true })
		expect(grade(7.0001, { numberAnswer: 7, numberTolerance: 0 })).toMatchObject({ isCorrect: false })
		expect(grade(-2.5, { numberAnswer: -2.5, numberTolerance: 0 })).toMatchObject({ isCorrect: true })
	})
	it('схема: допуск не отрицательный, число конечное; ученику верное число не уходит', () => {
		expect(number.schema.safeParse({ ...q, numberTolerance: -1 }).success).toBe(false)
		expect(number.schema.safeParse({ ...q, numberAnswer: Number.NaN }).success).toBe(false)
		expect(JSON.stringify(number.toPublic(q))).not.toMatch(/numberAnswer|numberTolerance|3\.14/)
	})
	it('ввод: запятая и точка; не число — null', () => {
		expect(parseNumber('3,14')).toBe(3.14)
		expect(parseNumber(' 2.5 ')).toBe(2.5)
		expect(parseNumber('')).toBeNull()
		expect(parseNumber('abc')).toBeNull()
		const pub = number.toPublic(q)
		expect(
			renderToStaticMarkup(<NumberViewer testId="q" data={pub} response={{ value: 3.14 }} onChange={() => {}} />),
		).toContain('3,14')
		expect(
			renderToStaticMarkup(<NumberViewer testId="q" data={pub} response={null} review={number.review(q)} />),
		).toContain('3,14 ± 0,005')
	})
})

describe('ordering', () => {
	const q = ordering.example() // Эскиз → Заливка → Детали; 3 балла, partial
	const [e, z, d] = q.steps.map((s) => s.id as string) as [string, string, string]
	const grade = (order: string[], scoring: 'all_or_nothing' | 'partial' = q.scoring) =>
		ordering.grade?.({ ...q, scoring }, { order })

	it('полный порядок — полный балл', () => {
		expect(grade([e, z, d])).toEqual({ score: 3, max: 3, isCorrect: true })
	})
	it('частичный: доля элементов на своих местах', () => {
		expect(grade([e, d, z])).toEqual({ score: 1, max: 3, isCorrect: false })
		expect(grade([z, d, e])).toEqual({ score: 0, max: 3, isCorrect: false })
		expect(grade([e, z])).toEqual({ score: 2, max: 3, isCorrect: false }) // неполный ответ
		expect(grade([])).toMatchObject({ score: 0 })
	})
	it('всё или ничего', () => {
		expect(grade([e, d, z], 'all_or_nothing')).toMatchObject({ score: 0 })
		expect(grade([e, z, d], 'all_or_nothing')).toMatchObject({ score: 3 })
	})
	it('схема: позиции — 0, 1, 2…; пустой элемент — ITEM_REQUIRED', () => {
		const bad = { ...q, steps: q.steps.map((s, i) => ({ ...s, correctPosition: i + 1 })) }
		expect(codes(ordering.schema.safeParse(bad))).toContain('BAD_ORDER')
		const empty = { ...q, steps: q.steps.map((s, i) => (i === 1 ? { ...s, body: emptyDoc() } : s)) }
		expect(codes(ordering.schema.safeParse(empty))).toContain('ITEM_REQUIRED')
	})
	it('toPublic не раскрывает верный порядок: нет позиций, порядок не зависит от порядка хранения', () => {
		const pub = ordering.toPublic(q)
		expect(JSON.stringify(pub)).not.toMatch(/correctPosition|explanation/)
		const reversed = ordering.toPublic({
			...q,
			steps: [...q.steps].reverse().map((s, i) => ({ ...s, correctPosition: i })),
		})
		expect(pub.steps.map((s) => s.id)).toEqual(reversed.steps.map((s) => s.id)) // по хэшу id, а не по позиции
		expect(shuffled(pub.steps).map((s) => s.id)).toEqual(pub.steps.map((s) => s.id)) // детерминированно
	})
	it('просмотр: в разборе — места верные и неверные, верный порядок', () => {
		const pub = ordering.toPublic(q)
		const html = renderToStaticMarkup(
			<OrderingViewer testId="q" data={pub} response={{ order: [e, d, z] }} review={ordering.review(q)} />,
		)
		expect(html.match(/data-correct="true"/g)).toHaveLength(1)
		expect(html.match(/data-wrong-choice="true"/g)).toHaveLength(2)
		expect(html).toContain('q-correct-order')
	})
})

describe('matching', () => {
	const q = matching.example() // Франция–Париж, Италия–Рим; 2 балла, partial
	const [l1, l2] = q.left.map((x) => x.id as string) as [string, string]
	const [r1, r2] = q.right.map((x) => x.id as string) as [string, string]
	const grade = (pairs: { left: string; right: string }[], scoring: 'all_or_nothing' | 'partial' = q.scoring) =>
		matching.grade?.({ ...q, scoring }, { pairs })

	it('все пары верны — полный балл', () => {
		expect(
			grade([
				{ left: l1, right: r1 },
				{ left: l2, right: r2 },
			]),
		).toEqual({ score: 2, max: 2, isCorrect: true })
	})
	it('частичный: доля верных пар; пустой ответ — ноль', () => {
		expect(
			grade([
				{ left: l1, right: r1 },
				{ left: l2, right: r1 },
			]),
		).toEqual({ score: 1, max: 2, isCorrect: false })
		expect(
			grade([
				{ left: l1, right: r2 },
				{ left: l2, right: r1 },
			]),
		).toMatchObject({ score: 0 })
		expect(grade([{ left: l1, right: r1 }])).toMatchObject({ score: 1 })
		expect(grade([])).toMatchObject({ score: 0, isCorrect: false })
		expect(grade([{ left: crypto.randomUUID(), right: r1 }])).toMatchObject({ score: 0 }) // чужой id
	})
	it('всё или ничего', () => {
		expect(
			grade(
				[
					{ left: l1, right: r1 },
					{ left: l2, right: r1 },
				],
				'all_or_nothing',
			),
		).toMatchObject({ score: 0 })
	})
	it('схема: у каждой левой — ровно одна правая с тем же ключом', () => {
		const extra = { ...q, right: [...q.right, { body: q.right[0]?.body ?? emptyDoc(), matchKey: 'zzz' }] }
		const broken = { ...q, right: q.right.map((r) => ({ ...r, matchKey: 'fr' })) }
		expect(codes(matching.schema.safeParse(extra))).toContain('BAD_PAIRS')
		expect(codes(matching.schema.safeParse(broken))).toContain('BAD_PAIRS')
	})
	it('toPublic: ключей пары нет, правые части перемешаны и отделены от левых', () => {
		const pub = matching.toPublic(q)
		expect(JSON.stringify(pub)).not.toMatch(/matchKey|explanation/)
		expect(pub.right.map((r) => r.id).sort()).toEqual([r1, r2].sort())
	})
	it('просмотр: в разборе — верные и неверные строки с подсказкой верной пары', () => {
		const pub = matching.toPublic(q)
		const html = renderToStaticMarkup(
			<MatchingViewer
				testId="q"
				data={pub}
				response={{
					pairs: [
						{ left: l1, right: r1 },
						{ left: l2, right: r1 },
					],
				}}
				review={matching.review(q)}
			/>,
		)
		expect(html.match(/data-correct="true"/g)).toHaveLength(1)
		expect(html.match(/data-wrong-choice="true"/g)).toHaveLength(1)
		expect(html).toContain('Рим') // верная пара для «Италия»
	})
})

describe('open_text', () => {
	it('ручная проверка: grade нет, ответ — непустой текст до 5000 символов', () => {
		expect(openText.manual).toBe(true)
		expect(openText.grade).toBeUndefined()
		expect(openText.responseSchema.safeParse({ text: 'Мой ответ' }).success).toBe(true)
		expect(openText.responseSchema.safeParse({ text: '   ' }).success).toBe(false)
		expect(openText.responseSchema.safeParse({ text: 'я'.repeat(5001) }).success).toBe(false)
	})
	it('образец ответа (пояснение) ученику не уходит', () => {
		expect(JSON.stringify(openText.toPublic(openText.example()))).not.toMatch(/explanation|Образец/)
	})
})

describe('single_choice: схема строже', () => {
	it('пустой вариант — OPTION_REQUIRED, пустая формулировка — PROMPT_REQUIRED', () => {
		const ex = singleChoice.example()
		expect(
			codes(
				singleChoice.schema.safeParse({
					...ex,
					options: ex.options.map((o, i) => (i === 0 ? { ...o, body: emptyDoc() } : o)),
				}),
			),
		).toContain('OPTION_REQUIRED')
		expect(codes(singleChoice.schema.safeParse({ ...ex, prompt: emptyDoc() }))).toContain('PROMPT_REQUIRED')
	})
})
