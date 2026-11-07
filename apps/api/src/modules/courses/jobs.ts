// Фоновые задачи модуля courses (скилл background-jobs).
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { ProviderError } from '#/kernel/video/index.ts'
import { processingVideoBlockIds, syncVideoBlock } from './video.service.ts'

/**
 * Раз в минуту по всем школам: статус видео, которое ещё обрабатывается (подпись вебхука Kinescope не подтверждена,
 * поэтому статус узнаём опросом; редактор опрашивает сам, задача — страховка для закрытой вкладки).
 */
export const videoSyncJob = defineJob({
	name: 'courses.video-sync',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '* * * * *',
	handler: async (ctx) => {
		for (const id of await processingVideoBlockIds(ctx)) {
			try {
				await syncVideoBlock(ctx, id)
			} catch (e) {
				if (!(e instanceof ProviderError)) throw e
				ctx.log.warn({ provider: e.provider, err: e.message }, 'video status not fetched')
			}
		}
	},
})
