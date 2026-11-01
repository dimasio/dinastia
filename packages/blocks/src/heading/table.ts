import { blockTable } from '@dinastia/db'
import { pgEnum, text } from 'drizzle-orm/pg-core'
import { HEADING_LEVELS } from './definition.ts'

export const headingLevel = pgEnum('block_heading_level', HEADING_LEVELS)

/** block_heading: уровень и текст заголовка. */
export const blockHeading = blockTable('heading', {
	level: headingLevel('level').notNull().default('h2'),
	text: text('text').notNull().default(''),
})
