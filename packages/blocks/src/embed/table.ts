import { blockTable } from '@dinastia/db'
import { integer, text } from 'drizzle-orm/pg-core'

/** block_embed: ссылка на сервис из белого списка, высота рамки и подпись. */
export const blockEmbed = blockTable('embed', {
	url: text('url').notNull().default(''),
	height: integer('height').notNull().default(480),
	caption: text('caption'),
})
