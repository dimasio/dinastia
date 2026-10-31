import { blockTable, richText } from '@dinastia/db'
import { pgEnum } from 'drizzle-orm/pg-core'
import { CALLOUT_TONES } from './definition.ts'

export const calloutTone = pgEnum('block_callout_tone', CALLOUT_TONES)

/** block_callout: плашка-выноска с тоном и текстом. */
export const blockCallout = blockTable('callout', {
	tone: calloutTone('tone').notNull().default('info'),
	body: richText('body').notNull(),
})
