import { blockTable } from '@dinastia/db'
import { index, text, uuid } from 'drizzle-orm/pg-core'

/**
 * block_video: ссылка на видео сервиса из белого списка или загруженное видео (provider, video_id, status), подпись.
 * Видео в хранилище школы (provider `storage`, D-070) — `file_id` (`courses.lesson-video`); внешний ключ на files — в миграции.
 */
export const blockVideo = blockTable(
	'video',
	{
		source: text('source').notNull().default('link'),
		url: text('url').notNull().default(''),
		provider: text('provider'),
		videoId: text('video_id'),
		status: text('status'),
		fileId: uuid('file_id'),
		caption: text('caption'),
	},
	(t) => [index().on(t.schoolId, t.fileId)],
)
