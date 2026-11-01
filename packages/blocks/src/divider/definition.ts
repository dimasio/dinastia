import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Разделитель: горизонтальная линия между частями урока; данных нет. */
export const divider = defineBlock({
	type: 'divider',
	category: 'layout',
	schema: z.object({}),
	defaults: () => ({}),
	completion: 'none',
})
