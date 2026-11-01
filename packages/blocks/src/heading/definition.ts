import { z } from 'zod'
import { defineBlock } from '../define.ts'

export const HEADING_LEVELS = ['h2', 'h3'] as const

/** Заголовок раздела урока (H2, H3); в плеере — пункт оглавления (2.6). */
export const heading = defineBlock({
	type: 'heading',
	category: 'content',
	schema: z.object({
		level: z.enum(HEADING_LEVELS),
		text: z.string().max(200),
	}),
	defaults: () => ({ level: 'h2' as const, text: '' }),
	completion: 'none',
	issues: { empty: (d) => d.text.trim() === '' },
})
