import { blockTable, richText } from '@dinastia/db'

/** block_text: тело — форматированный текст (профиль lesson). */
export const blockText = blockTable('text', {
	body: richText('body').notNull(),
})
