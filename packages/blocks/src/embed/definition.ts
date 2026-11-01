import { embedSrc } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

export const EMBED_HEIGHT = { min: 200, max: 1200, default: 480 } as const

/** Встраивание: видео, Яндекс Формы, Google Формы — только сервисы белого списка (contracts/common/embed.ts). */
export const embed = defineBlock({
	type: 'embed',
	category: 'media',
	schema: z.object({
		url: z
			.string()
			.trim()
			.max(2000)
			.refine((u) => u === '' || embedSrc(u) !== null, 'EMBED_NOT_ALLOWED'),
		height: z.number().int().min(EMBED_HEIGHT.min).max(EMBED_HEIGHT.max),
		caption: z.string().trim().max(300).nullish(),
	}),
	defaults: () => ({ url: '', height: EMBED_HEIGHT.default, caption: null }),
	completion: 'none',
	issues: { noUrl: (d) => d.url === '' },
	toPublic: (d) => ({ src: d.url ? embedSrc(d.url) : null, height: d.height, caption: d.caption ?? null }),
})
