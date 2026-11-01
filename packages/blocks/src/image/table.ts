import { blockTable } from '@dinastia/db'
import { text, uuid } from 'drizzle-orm/pg-core'

/** block_image: картинка урока — файл школы (`courses.lesson-image`); внешний ключ на files — в миграции (D-054). */
export const blockImage = blockTable('image', {
	fileId: uuid('file_id'),
	alt: text('alt'),
	caption: text('caption'),
})
