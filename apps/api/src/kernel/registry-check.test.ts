// check:registries (пункт 1.5): ловит намеренно сломанные блок, вопрос, таблицы и коды ошибок; на реальных
// реестрах — чисто.
import type { AnyBlockDef } from '@dinastia/blocks'
import { blockStorages } from '@dinastia/blocks/server'
import { CompactText, emptyDoc, RichText } from '@dinastia/contracts/common'
import { blockTable, opaqueJson, pii, richText, tenantTable } from '@dinastia/db'
import { resources } from '@dinastia/i18n'
import { type AnyQuestionDef, questionTypes } from '@dinastia/questions'
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as schema from '#/db-schema.ts'
import { GLOBAL_TABLES_WITH_SCHOOL_REF } from './db/rls-coverage.ts'
import { blockIssues, errorCodeIssues, errorCodesIn, questionIssues, tableIssues, tablesOf } from './registry-check.ts'

const messages = (issues: { message: string }[]) => issues.map((i) => i.message)

describe('сломанный блок', () => {
	// Собран в обход defineBlock (как если бы определение поправили, а таблицу и строки — нет).
	const brokenTable = blockTable('broken_probe', { title: text('title').notNull(), extra: text('extra') })
	const broken = {
		type: 'broken_probe',
		category: 'content',
		schema: z.object({ body: CompactText, answer: z.string() }),
		defaults: () => ({ body: emptyDoc(), answer: '' }),
		example: () => ({ body: emptyDoc(), answer: '42' }),
		completion: 'none',
		secretKeys: ['answer'],
		toPublic: (d: unknown) => d, // секрет уходит ученику
	} as unknown as AnyBlockDef

	it('расхождение схемы и таблицы, утечка секрета, нет строк, ключ ≠ type — всё в отчёте', () => {
		const issues = blockIssues({ broken_key: { def: broken, table: brokenTable, children: {} } }, resources.ru.blocks)
		expect(issues.every((i) => i.area === 'blocks' && i.where === 'broken_key')).toBe(true)
		expect(messages(issues)).toEqual([
			'ключ реестра «broken_key» ≠ type «broken_probe»',
			'нет колонок для полей схемы: body, answer',
			'колонки без поля в схеме: title, extra',
			'toPublic отдаёт секрет answer ученику',
			'нет строки blocks:broken_key.title',
			'нет строки blocks:broken_key.description',
		])
	})
})

describe('сломанный тип вопроса', () => {
	const broken = {
		type: 'broken_q',
		uses: { columns: [], items: [] },
		schema: z.object({ prompt: RichText, points: z.number(), numberAnswer: z.number() }),
		defaults: () => ({}),
		example: () => ({ prompt: emptyDoc(), points: 1, numberAnswer: 4 }),
		secretKeys: ['numberAnswer'],
		toPublic: (d: unknown) => d,
		responseSchema: z.object({}),
		review: () => null,
		shuffle: false,
	} as unknown as AnyQuestionDef

	it('нет общего поля, чужая колонка, нет grade, утечка, нет строк', () => {
		expect(messages(questionIssues({ broken_q: broken }, resources.ru.questions))).toEqual([
			'нет общего поля explanation',
			'поле numberAnswer — колонка типа, а её нет в uses.columns',
			'нет grade (и не manual)',
			'toPublic отдаёт секрет numberAnswer ученику',
			'нет строки questions:broken_q.title',
			'нет строки questions:broken_q.description',
		])
	})
})

describe('таблицы', () => {
	it('голый jsonb, school_id без RLS, имя ПДн без pii() — нарушения; хелперы и pii() — нет', () => {
		const good = tenantTable('probe_good', {
			body: richText('body'),
			payload: opaqueJson('payload'),
			email: pii(text('email')),
		})
		const bad = pgTable('probe_bad', {
			id: uuid('id').primaryKey(),
			schoolId: uuid('school_id'),
			data: jsonb('data'),
			phone: text('phone'),
		})
		expect(tableIssues([good], {})).toEqual([])
		expect(tableIssues([bad], {}).map((i) => `${i.where}: ${i.message.split(' — ')[0]}`)).toEqual([
			'probe_bad.data: jsonb без richText()/opaqueJson()',
			'probe_bad.phone: имя похоже на ПДн',
			'probe_bad: есть school_id, но RLS не включён',
			'probe_bad: есть school_id, но нет политики RLS (tenantTable/blockTable)',
		])
		expect(tableIssues([bad], { probe_bad: 'исключение для теста' }).map((i) => i.where)).toEqual([
			'probe_bad.data',
			'probe_bad.phone',
		])
	})
})

describe('коды ошибок', () => {
	it('находит коды в fail.*, code/message и refine/regex контрактов; без текста — нарушение', () => {
		const source = [
			"fail.notFound('THING_NOT_FOUND')",
			"throw new ORPCError('FORBIDDEN', { message: 'NO_PERMISSION', data: { code: 'NO_PERMISSION' } })",
			".regex(/^[a-z]+$/, 'SLUG_FORMAT')",
			".refine((s) => s.length > 1, 'TOO_SHORT_PROBE')",
			"const label = 'NOT_A_CODE_CONTEXT'",
		].join('\n')
		expect(errorCodesIn(source).sort()).toEqual(['NO_PERMISSION', 'SLUG_FORMAT', 'THING_NOT_FOUND', 'TOO_SHORT_PROBE'])
		expect(errorCodeIssues([{ path: 'x.ts', source }], resources.ru.errors).map((i) => i.message)).toEqual([
			'нет текста errors:THING_NOT_FOUND (packages/i18n/locales/ru/errors.json)',
			'нет текста errors:TOO_SHORT_PROBE (packages/i18n/locales/ru/errors.json)',
		])
	})
})

describe('реальные реестры', () => {
	it('чисто: таблицы приложения, блоки, типы вопросов', () => {
		expect(tableIssues(tablesOf(schema), GLOBAL_TABLES_WITH_SCHOOL_REF)).toEqual([])
		expect(blockIssues(blockStorages, resources.ru.blocks)).toEqual([])
		expect(questionIssues(questionTypes, resources.ru.questions)).toEqual([])
	})
})
