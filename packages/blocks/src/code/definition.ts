import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Языки подсветки (highlight.js, D-055); `html` подсвечивается как xml. Новый — значение enum + миграция. */
export const CODE_LANGUAGES = [
	'plaintext',
	'python',
	'javascript',
	'typescript',
	'html',
	'css',
	'sql',
	'bash',
	'json',
] as const

/** Код: моноширинный текст с подсветкой и кнопкой «Копировать». */
export const code = defineBlock({
	type: 'code',
	category: 'content',
	schema: z.object({
		language: z.enum(CODE_LANGUAGES),
		code: z.string().max(20_000),
	}),
	defaults: () => ({ language: 'plaintext' as const, code: '' }),
	completion: 'none',
})
