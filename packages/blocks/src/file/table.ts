import { blockTable } from '@dinastia/db'
import { text, uuid } from 'drizzle-orm/pg-core'

/** block_file: файл для скачивания — файл школы (`courses.lesson-file`); внешний ключ на files — в миграции (D-054). */
export const blockFile = blockTable('file', {
	fileId: uuid('file_id'),
	title: text('title'),
})
