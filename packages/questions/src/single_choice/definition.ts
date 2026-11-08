import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { PromptText, requiredCompact } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Один верный вариант из нескольких. */
export const singleChoice = defineQuestion({
	type: 'single_choice',
	uses: { columns: [], items: ['option'] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: z.number().int().min(1).max(100),
		options: z
			.array(z.object({ id: Id.optional(), body: requiredCompact('OPTION_REQUIRED'), isCorrect: z.boolean() }))
			.min(2)
			.max(20)
			.refine((o) => o.filter((x) => x.isCorrect).length === 1, { message: 'NEED_ONE_CORRECT' }),
	}),
	items: { options: 'option' },
	defaults: () => ({
		prompt: emptyDoc(),
		explanation: null,
		points: 1,
		options: [
			{ body: emptyDoc(), isCorrect: true },
			{ body: emptyDoc(), isCorrect: false },
		],
	}),
	example: () => ({
		prompt: doc('Сколько будет 2 + 2?'),
		explanation: doc('Два плюс два — четыре.'),
		points: 2,
		options: [
			{ id: '0199e3a0-0000-7000-8000-00000000000a', body: doc('3'), isCorrect: false },
			{ id: '0199e3a0-0000-7000-8000-00000000000b', body: doc('4'), isCorrect: true },
			{ id: '0199e3a0-0000-7000-8000-00000000000c', body: doc('5'), isCorrect: false },
		],
	}),
	secretKeys: ['options.*.isCorrect', 'explanation'],
	toPublic: ({ prompt, points, options }) => ({
		prompt,
		points,
		options: options.map(({ isCorrect: _, ...o }) => o),
	}),
	responseSchema: z.object({ selected: Id.nullable() }),
	grade: (q, r) => {
		const correct = q.options.find((o) => o.isCorrect)?.id
		const isCorrect = r.selected !== null && r.selected === correct
		return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
	},
	review: (q) => ({ correct: q.options.filter((o) => o.isCorrect).map((o) => o.id), explanation: q.explanation }),
	shuffle: 'items',
})
