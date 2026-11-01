import { blockTable } from '@dinastia/db'
import { text } from 'drizzle-orm/pg-core'

/** block_video: ссылка на видео сервиса из белого списка и подпись. */
export const blockVideo = blockTable('video', {
	url: text('url').notNull().default(''),
	caption: text('caption'),
})
