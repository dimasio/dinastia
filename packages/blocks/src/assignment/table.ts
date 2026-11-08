import { blockTable, richText } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { boolean, integer } from 'drizzle-orm/pg-core'

/** block_assignment: формулировка задания (форматированный текст) и что принимать (карточка 3.4). */
export const blockAssignment = blockTable('assignment', {
	prompt: richText('prompt').notNull().default(sql`'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb`),
	allowText: boolean('allow_text').notNull().default(true),
	allowFiles: boolean('allow_files').notNull().default(true),
	maxFiles: integer('max_files').notNull().default(3),
	requiresReview: boolean('requires_review').notNull().default(true),
})
