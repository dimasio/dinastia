import { emptyDoc, isEmptyDoc, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Текст урока: форматированный текст, профиль `lesson` (заголовки, списки, цитаты, таблицы, код, ссылки). */
export const text = defineBlock({
	type: 'text',
	category: 'content',
	schema: z.object({ body: RichText }),
	defaults: () => ({ body: emptyDoc() }),
	completion: 'none',
	issues: { empty: (d) => isEmptyDoc(d.body) },
})
