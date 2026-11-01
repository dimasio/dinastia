import { embedSrc, isVideoUrl } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Видео по ссылке: YouTube, Rutube, VK Видео, Kinescope, Vimeo. Загрузка в Kinescope — 2.4b. */
export const video = defineBlock({
	type: 'video',
	category: 'media',
	schema: z.object({
		// пусто — черновик ещё не заполнен; урок с таким блоком не публикуется (issues)
		url: z
			.string()
			.trim()
			.max(2000)
			.refine((u) => u === '' || isVideoUrl(u), 'EMBED_NOT_ALLOWED'),
		caption: z.string().trim().max(300).nullish(),
	}),
	defaults: () => ({ url: '', caption: null }),
	completion: 'none',
	issues: { noUrl: (d) => d.url === '' },
	// ученику — адрес плеера, а не исходная ссылка
	toPublic: (d) => ({ src: d.url ? embedSrc(d.url) : null, caption: d.caption ?? null }),
})
