import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText, requiredCompact, roundScore, Scoring } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Несколько верных вариантов из списка: «всё или ничего» либо частичный балл (карточка 3.2). */
export const multipleChoice = defineQuestion({
	type: 'multiple_choice',
	uses: { columns: ['scoring'], items: ['option'] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
		scoring: Scoring,
		options: z
			.array(z.object({ id: Id.optional(), body: requiredCompact('OPTION_REQUIRED'), isCorrect: z.boolean() }))
			.min(2)
			.max(20)
			.refine((o) => o.some((x) => x.isCorrect), { message: 'NEED_CORRECT' })
			.refine((o) => o.some((x) => !x.isCorrect), { message: 'NEED_INCORRECT' }),
	}),
	items: { options: 'option' },
	defaults: () => ({
		prompt: emptyDoc(),
		explanation: null,
		points: 1,
		scoring: 'all_or_nothing' as const,
		options: [
			{ body: emptyDoc(), isCorrect: true },
			{ body: emptyDoc(), isCorrect: false },
		],
	}),
	example: () => ({
		prompt: doc('Какие из чисел простые?'),
		explanation: doc('Простые числа делятся только на единицу и на себя.'),
		points: 4,
		scoring: 'partial' as const,
		options: [
			{ id: '0199e3a0-0000-7000-8000-000000000101', body: doc('2'), isCorrect: true },
			{ id: '0199e3a0-0000-7000-8000-000000000102', body: doc('4'), isCorrect: false },
			{ id: '0199e3a0-0000-7000-8000-000000000103', body: doc('7'), isCorrect: true },
			{ id: '0199e3a0-0000-7000-8000-000000000104', body: doc('9'), isCorrect: false },
		],
	}),
	secretKeys: ['options.*.isCorrect', 'explanation'],
	toPublic: ({ prompt, points, options }) => ({
		prompt,
		points,
		options: options.map(({ isCorrect: _, ...o }) => o),
	}),
	responseSchema: z.object({ selected: z.array(Id).max(20) }),
	grade: (q, r) => {
		const selected = new Set(r.selected)
		const correct = q.options.filter((o) => o.isCorrect)
		const right = correct.filter((o) => o.id && selected.has(o.id)).length
		const wrong = q.options.filter((o) => !o.isCorrect && o.id && selected.has(o.id)).length
		const isCorrect = right === correct.length && wrong === 0
		if (q.scoring === 'all_or_nothing') return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
		return { score: roundScore(q.points * Math.max(0, (right - wrong) / correct.length)), max: q.points, isCorrect }
	},
	review: (q) => ({ correct: q.options.filter((o) => o.isCorrect).map((o) => o.id), explanation: q.explanation }),
	shuffle: 'items',
})
