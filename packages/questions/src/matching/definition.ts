import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText, requiredCompact, roundScore, Scoring, shuffled } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const Half = z.object({
	id: Id.optional(),
	body: requiredCompact('ITEM_REQUIRED'),
	matchKey: z.string().min(1).max(64),
})

/** Сопоставить пары «левое — правое»: всё или ничего, либо доля верных пар (карточка 3.2). Лишних правых частей нет. */
export const matching = defineQuestion({
	type: 'matching',
	uses: { columns: ['scoring'], items: ['match_left', 'match_right'] },
	schema: z
		.object({
			prompt: PromptText,
			explanation: RichText.nullable(),
			points: Points,
			scoring: Scoring,
			left: z.array(Half).min(2).max(10),
			right: z.array(Half).min(2).max(10),
		})
		// каждой левой части — ровно одна правая с тем же ключом пары
		.refine(
			(q) =>
				q.left.length === q.right.length &&
				new Set(q.left.map((l) => l.matchKey)).size === q.left.length &&
				q.left.every((l) => q.right.filter((r) => r.matchKey === l.matchKey).length === 1),
			{ message: 'BAD_PAIRS' },
		),
	items: { left: 'match_left', right: 'match_right' },
	defaults: () => ({
		prompt: emptyDoc(),
		explanation: null,
		points: 1,
		scoring: 'all_or_nothing' as const,
		left: [
			{ body: emptyDoc(), matchKey: 'p1' },
			{ body: emptyDoc(), matchKey: 'p2' },
		],
		right: [
			{ body: emptyDoc(), matchKey: 'p1' },
			{ body: emptyDoc(), matchKey: 'p2' },
		],
	}),
	example: () => ({
		prompt: doc('Сопоставьте страны и столицы.'),
		explanation: doc('Франция — Париж, Италия — Рим.'),
		points: 2,
		scoring: 'partial' as const,
		left: [
			{ id: '0199e3a0-0000-7000-8000-000000000501', body: doc('Франция'), matchKey: 'fr' },
			{ id: '0199e3a0-0000-7000-8000-000000000502', body: doc('Италия'), matchKey: 'it' },
		],
		right: [
			{ id: '0199e3a0-0000-7000-8000-000000000511', body: doc('Париж'), matchKey: 'fr' },
			{ id: '0199e3a0-0000-7000-8000-000000000512', body: doc('Рим'), matchKey: 'it' },
		],
	}),
	secretKeys: ['left.*.matchKey', 'right.*.matchKey', 'explanation'],
	// правые части — отдельным «перемешанным» списком и без ключей пары: связь не раскрыта
	toPublic: ({ prompt, points, left, right }) => ({
		prompt,
		points,
		left: left.map(({ matchKey: _, ...l }) => l),
		right: shuffled(right.map(({ matchKey: _, ...r }) => r)),
	}),
	responseSchema: z.object({ pairs: z.array(z.object({ left: Id, right: Id })).max(10) }),
	grade: (q, r) => {
		const keyOfRight = new Map(q.right.map((x) => [x.id, x.matchKey]))
		const chosen = new Map(r.pairs.map((p) => [p.left, p.right]))
		const hits = q.left.filter((l) => {
			const right = l.id === undefined ? undefined : chosen.get(l.id)
			return right !== undefined && keyOfRight.get(right) === l.matchKey
		}).length
		const isCorrect = hits === q.left.length
		if (q.scoring === 'all_or_nothing') return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
		return { score: roundScore((q.points * hits) / q.left.length), max: q.points, isCorrect }
	},
	review: (q) => ({
		pairs: q.left.map((l) => ({ left: l.id, right: q.right.find((x) => x.matchKey === l.matchKey)?.id })),
		explanation: q.explanation,
	}),
	shuffle: 'items',
})
