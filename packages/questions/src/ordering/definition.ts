import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText, requiredCompact, roundScore, Scoring, shuffled } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Расставить элементы по порядку: всё или ничего, либо доля элементов на своих местах (карточка 3.2). */
export const ordering = defineQuestion({
	type: 'ordering',
	uses: { columns: ['scoring'], items: ['order_item'] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
		scoring: Scoring,
		// массив — в верном порядке; `correctPosition` = номер в нём (0, 1, 2…)
		steps: z
			.array(
				z.object({
					id: Id.optional(),
					body: requiredCompact('ITEM_REQUIRED'),
					correctPosition: z.number().int().min(0).max(9),
				}),
			)
			.min(2)
			.max(10)
			.refine((s) => s.every((x, i) => x.correctPosition === i), { message: 'BAD_ORDER' }),
	}),
	items: { steps: 'order_item' },
	defaults: () => ({
		prompt: emptyDoc(),
		explanation: null,
		points: 1,
		scoring: 'all_or_nothing' as const,
		steps: [
			{ body: emptyDoc(), correctPosition: 0 },
			{ body: emptyDoc(), correctPosition: 1 },
		],
	}),
	example: () => ({
		prompt: doc('Расставьте этапы создания акварели по порядку.'),
		explanation: doc('Сначала эскиз, затем заливка, в конце детали.'),
		points: 3,
		scoring: 'partial' as const,
		steps: [
			{ id: '0199e3a0-0000-7000-8000-000000000401', body: doc('Эскиз'), correctPosition: 0 },
			{ id: '0199e3a0-0000-7000-8000-000000000402', body: doc('Заливка'), correctPosition: 1 },
			{ id: '0199e3a0-0000-7000-8000-000000000403', body: doc('Детали'), correctPosition: 2 },
		],
	}),
	secretKeys: ['steps.*.correctPosition', 'explanation'],
	// порядок в ответе не раскрывает верный: id элементов упорядочены по хэшу, не по позиции
	toPublic: ({ prompt, points, steps }) => ({
		prompt,
		points,
		steps: shuffled(steps.map(({ correctPosition: _, ...s }) => s)),
	}),
	responseSchema: z.object({ order: z.array(Id).max(10) }),
	grade: (q, r) => {
		const correct = [...q.steps].sort((a, b) => a.correctPosition - b.correctPosition).map((s) => s.id)
		const inPlace = correct.filter((id, i) => id !== undefined && r.order[i] === id).length
		const isCorrect = inPlace === correct.length && r.order.length === correct.length
		if (q.scoring === 'all_or_nothing') return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
		return { score: roundScore((q.points * inPlace) / correct.length), max: q.points, isCorrect }
	},
	review: (q) => ({
		order: [...q.steps].sort((a, b) => a.correctPosition - b.correctPosition).map((s) => s.id),
		explanation: q.explanation,
	}),
	shuffle: 'items',
})
