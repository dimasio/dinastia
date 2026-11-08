import { emptyDoc, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Развёрнутый ответ: проверяет человек (3.6), `gradeAnswer` возвращает null. Образец ответа — в «пояснении». */
export const openText = defineQuestion({
	type: 'open_text',
	uses: { columns: [], items: [] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
	}),
	defaults: () => ({ prompt: emptyDoc(), explanation: null, points: 1 }),
	example: () => ({
		prompt: doc('Опишите, как вы смешиваете краски для телесного оттенка.'),
		explanation: doc('Образец: охра, немного красного, капля синего.'),
		points: 5,
	}),
	secretKeys: ['explanation'],
	toPublic: ({ prompt, points }) => ({ prompt, points }),
	responseSchema: z.object({ text: z.string().trim().min(1).max(5000) }),
	manual: true,
	review: (q) => ({ explanation: q.explanation }),
	shuffle: false,
})
