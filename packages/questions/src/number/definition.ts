import { emptyDoc, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Числовой ответ: верное число и допуск (абсолютный; 0 — точное совпадение), карточка 3.2. */
export const number = defineQuestion({
	type: 'number',
	uses: { columns: ['numberAnswer', 'numberTolerance'], items: [] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
		numberAnswer: z.number().finite(),
		numberTolerance: z.number().finite().min(0).max(1e12),
	}),
	defaults: () => ({ prompt: emptyDoc(), explanation: null, points: 1, numberAnswer: 0, numberTolerance: 0 }),
	example: () => ({
		prompt: doc('Чему равно число π с точностью до сотых?'),
		explanation: doc('π ≈ 3,14.'),
		points: 2,
		numberAnswer: 3.14,
		numberTolerance: 0.005,
	}),
	secretKeys: ['numberAnswer', 'numberTolerance', 'explanation'],
	toPublic: ({ prompt, points }) => ({ prompt, points }),
	responseSchema: z.object({ value: z.number().finite().nullable() }),
	grade: (q, r) => {
		const isCorrect = r.value !== null && Math.abs(r.value - q.numberAnswer) <= q.numberTolerance + 1e-9
		return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
	},
	review: (q) => ({ answer: q.numberAnswer, tolerance: q.numberTolerance, explanation: q.explanation }),
	shuffle: false,
})
