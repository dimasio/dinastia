import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { matchesPattern, normalizeText, Points, PromptText } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/**
 * Ответ текстом: допустимые ответы (точные или с подстановками `*` и `?`), регистр по настройке; пробелы по краям и
 * подряд идущие схлопываются, `ё` = `е` (карточка 3.2).
 */
export const textInput = defineQuestion({
	type: 'text_input',
	uses: { columns: ['caseSensitive'], items: ['accepted_text'] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
		caseSensitive: z.boolean(),
		accepted: z
			.array(z.object({ id: Id.optional(), text: z.string().trim().min(1, 'ANSWER_REQUIRED').max(200) }))
			.min(1)
			.max(20),
	}),
	items: { accepted: 'accepted_text' },
	defaults: () => ({
		prompt: emptyDoc(),
		explanation: null,
		points: 1,
		caseSensitive: false,
		accepted: [{ text: '' }],
	}),
	example: () => ({
		prompt: doc('Столица Франции?'),
		explanation: doc('Париж — столица Франции.'),
		points: 1,
		caseSensitive: false,
		accepted: [
			{ id: '0199e3a0-0000-7000-8000-000000000201', text: 'Париж' },
			{ id: '0199e3a0-0000-7000-8000-000000000202', text: 'г. Париж' },
			{ id: '0199e3a0-0000-7000-8000-000000000203', text: 'Париж*' },
		],
	}),
	secretKeys: ['accepted', 'explanation'],
	toPublic: ({ prompt, points }) => ({ prompt, points }),
	responseSchema: z.object({ text: z.string().max(500) }),
	grade: (q, r) => {
		const answer = normalizeText(r.text, q.caseSensitive)
		const isCorrect =
			answer !== '' && q.accepted.some((a) => matchesPattern(normalizeText(a.text, q.caseSensitive), answer))
		return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
	},
	review: (q) => ({ accepted: q.accepted.map((a) => a.text), explanation: q.explanation }),
	shuffle: false,
})
