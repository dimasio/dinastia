import { blockTable } from '@dinastia/db'
import { text } from 'drizzle-orm/pg-core'

/** block_video: ссылка на видео сервиса из белого списка или загруженное видео (provider, video_id, status), подпись. */
export const blockVideo = blockTable('video', {
	source: text('source').notNull().default('link'),
	url: text('url').notNull().default(''),
	provider: text('provider'),
	videoId: text('video_id'),
	status: text('status'),
	caption: text('caption'),
})
