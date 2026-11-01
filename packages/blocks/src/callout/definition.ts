import { CompactText, emptyDoc, isEmptyDoc } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

export const CALLOUT_TONES = ['info', 'warning', 'success'] as const

/** Выноска: важное, предупреждение или совет — цветная плашка с коротким текстом. */
export const callout = defineBlock({
	type: 'callout',
	category: 'content',
	schema: z.object({
		tone: z.enum(CALLOUT_TONES),
		body: CompactText,
	}),
	defaults: () => ({ tone: 'info' as const, body: emptyDoc() }),
	completion: 'none',
	issues: { empty: (d) => isEmptyDoc(d.body) },
})
