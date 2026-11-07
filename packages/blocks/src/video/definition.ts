import { embedSrc, isVideoUrl } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'
import { VIDEO_PROVIDERS, VIDEO_SOURCES, VIDEO_STATUSES, videoPlayerSrc } from './player.ts'

/**
 * Видео: по ссылке (YouTube, Rutube, VK Видео, Kinescope, Vimeo) или загруженное в сервис (2.4b). Для загруженного
 * `provider`, `videoId` и `status` пишет только сервер (клиентские значения при сохранении отбрасываются).
 */
export const video = defineBlock({
	type: 'video',
	category: 'media',
	schema: z.object({
		// поля 2.4b с умолчаниями: прежние клиенты и данные ({ url, caption }) остаются корректными
		source: z.enum(VIDEO_SOURCES).default('link'),
		// пусто — черновик ещё не заполнен; урок с таким блоком не публикуется (issues)
		url: z
			.string()
			.trim()
			.max(2000)
			.refine((u) => u === '' || isVideoUrl(u), 'EMBED_NOT_ALLOWED'),
		provider: z.enum(VIDEO_PROVIDERS).nullable().default(null),
		videoId: z.string().max(200).nullable().default(null),
		status: z.enum(VIDEO_STATUSES).nullable().default(null),
		caption: z.string().trim().max(300).nullish(),
	}),
	defaults: () => ({ source: 'link' as const, url: '', provider: null, videoId: null, status: null, caption: null }),
	completion: 'none',
	issues: {
		noUrl: (d) => d.source === 'link' && d.url === '',
		noVideo: (d) => d.source === 'upload' && !d.videoId,
		processing: (d) => d.source === 'upload' && !!d.videoId && d.status === 'processing',
		failed: (d) => d.source === 'upload' && !!d.videoId && d.status === 'failed',
	},
	// ученику — адрес плеера, а не исходная ссылка
	toPublic: (d) => ({
		src:
			d.source === 'upload'
				? d.status === 'ready' && d.provider && d.videoId
					? videoPlayerSrc(d.provider, d.videoId)
					: null
				: d.url
					? embedSrc(d.url)
					: null,
		caption: d.caption ?? null,
	}),
})
