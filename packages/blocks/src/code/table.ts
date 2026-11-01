import { blockTable } from '@dinastia/db'
import { pgEnum, text } from 'drizzle-orm/pg-core'
import { CODE_LANGUAGES } from './definition.ts'

export const codeLanguage = pgEnum('block_code_language', CODE_LANGUAGES)

/** block_code: язык подсветки и текст кода. */
export const blockCode = blockTable('code', {
	language: codeLanguage('language').notNull().default('plaintext'),
	code: text('code').notNull().default(''),
})
