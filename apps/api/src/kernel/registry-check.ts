// check:registries (скилл core-kernel, пункт 1.5): статические инварианты реестров и схемы — то, что агент или
// человек может забыть, а pnpm check должен поймать. Функции чистые (данные — параметрами), CLI — src/check-registries.ts.
import type { AnyBlockDef } from '@dinastia/blocks'
import { type BlockStorage, blockStorageIssues } from '@dinastia/blocks/server'
import { hasPath } from '@dinastia/contracts/common'
import { isPii, jsonKind } from '@dinastia/db'
import { type AnyQuestionDef, questionDefIssues } from '@dinastia/questions'
import { getTableName, is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { type AnySettingsDef, settingsIssues as settingsDefIssues } from './settings/settings.ts'

export interface Issue {
	/** Раздел отчёта: tables, blocks, questions, errors, registry. */
	area: string
	/** Где: таблица, тип блока, файл. */
	where: string
	message: string
}

/**
 * Колонки с «человеческими» именами, которые сознательно не ПДн (скилл personal-data): `<таблица>.<колонка>` → причина.
 * Новая запись — с согласия человека.
 */
export const NOT_PII: Readonly<Record<string, string>> = {
	'schools.name': 'название школы — данные организации, не человека',
	'users.email_verified': 'флаг «адрес подтверждён», не сам адрес',
}

/** Имена колонок, которые требуют решения «ПДн / не ПДн». */
export const PII_LIKE = /(^|_)(email|phone|name|address|birth)/

/**
 * Таблицы: jsonb — только через richText/opaqueJson (D-032); у таблицы с school_id — RLS и политика (D-006),
 * кроме глобальных исключений; колонки с именами ПДн — pii() или явное «не ПДн».
 */
export function tableIssues(tables: PgTable[], globalWithSchoolRef: Readonly<Record<string, string>>): Issue[] {
	const issues: Issue[] = []
	for (const table of tables) {
		const name = getTableName(table)
		const config = getTableConfig(table)
		for (const column of config.columns) {
			const where = `${name}.${column.name}`
			if ((column.columnType === 'PgJsonb' || column.columnType === 'PgJson') && !jsonKind(column))
				issues.push({
					area: 'tables',
					where,
					message: 'jsonb без richText()/opaqueJson() — данные в JSON нельзя (D-032)',
				})
			if (PII_LIKE.test(column.name) && !isPii(column) && !(where in NOT_PII))
				issues.push({
					area: 'tables',
					where,
					message: 'имя похоже на ПДн — пометь pii() или добавь в NOT_PII с причиной (скилл personal-data)',
				})
		}
		const hasSchool = config.columns.some((c) => c.name === 'school_id')
		if (hasSchool && !(name in globalWithSchoolRef)) {
			if (!config.enableRLS) issues.push({ area: 'tables', where: name, message: 'есть school_id, но RLS не включён' })
			if (!config.policies.length)
				issues.push({
					area: 'tables',
					where: name,
					message: 'есть school_id, но нет политики RLS (tenantTable/blockTable)',
				})
		}
	}
	return issues
}

type Strings = Record<string, unknown>
const text = (strings: Strings, path: string) =>
	path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Strings)[k] : undefined), strings)

/** Секреты: в примере каждый есть, после toPublic — ни одного. */
function secretIssues(
	area: string,
	where: string,
	def: {
		secretKeys?: readonly string[]
		toPublic: (d: never) => unknown
		schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }
	},
	example: unknown,
): Issue[] {
	const parsed = def.schema.safeParse(example)
	if (!parsed.success) return [{ area, where, message: 'example() не проходит schema' }]
	const pub = def.toPublic(parsed.data as never)
	return (def.secretKeys ?? []).flatMap((path) => {
		if (!hasPath(parsed.data, path))
			return [{ area, where, message: `в example() нет секрета ${path} — нечего проверять` }]
		if (hasPath(pub, path)) return [{ area, where, message: `toPublic отдаёт секрет ${path} ученику` }]
		return []
	})
}

/** Блоки: ключ = type, схема = таблицы, секреты не уходят ученику, строки палитры есть. */
export function blockIssues(storages: Readonly<Record<string, BlockStorage>>, strings: Strings): Issue[] {
	return Object.entries(storages).flatMap(([key, storage]) => {
		const def: AnyBlockDef = storage.def
		const where = key
		const issues: Issue[] = []
		if (def.type !== key) issues.push({ area: 'blocks', where, message: `ключ реестра «${key}» ≠ type «${def.type}»` })
		for (const m of blockStorageIssues(storage)) issues.push({ area: 'blocks', where, message: m })
		issues.push(...secretIssues('blocks', where, def, (def.example ?? def.defaults)()))
		for (const k of ['title', 'description', ...Object.keys(def.issues ?? {}).map((i) => `issues.${i}`)])
			if (typeof text(strings, `${key}.${k}`) !== 'string')
				issues.push({ area: 'blocks', where, message: `нет строки blocks:${key}.${k}` })
		return issues
	})
}

/** Типы вопросов: ключ = type, колонки и элементы по uses, секреты, проверка, строки. */
export function questionIssues(types: Readonly<Record<string, AnyQuestionDef>>, strings: Strings): Issue[] {
	return Object.entries(types).flatMap(([key, def]) => {
		const where = key
		const issues: Issue[] = []
		if (def.type !== key)
			issues.push({ area: 'questions', where, message: `ключ реестра «${key}» ≠ type «${def.type}»` })
		for (const m of questionDefIssues(def)) issues.push({ area: 'questions', where, message: m })
		if (!def.manual && !def.grade) issues.push({ area: 'questions', where, message: 'нет grade (и не manual)' })
		issues.push(...secretIssues('questions', where, def, def.example()))
		for (const k of ['title', 'description'])
			if (typeof text(strings, `${key}.${k}`) !== 'string')
				issues.push({ area: 'questions', where, message: `нет строки questions:${key}.${k}` })
		return issues
	})
}

/** Настройки модулей: поле = колонка с default, строки экрана — подпись, описание, группа. */
export function settingsIssues(defs: AnySettingsDef[], strings: Strings): Issue[] {
	return defs.flatMap((def) => {
		const where = def.module
		const issues: Issue[] = settingsDefIssues(def).map((message) => ({ area: 'settings', where, message }))
		for (const [name, field] of Object.entries(def.fields as Record<string, { group: string }>)) {
			for (const k of ['title', 'description'])
				if (typeof text(strings, `${def.module}.${name}.${k}`) !== 'string')
					issues.push({ area: 'settings', where, message: `нет строки settings:${def.module}.${name}.${k}` })
			if (typeof text(strings, `groups.${field.group}`) !== 'string')
				issues.push({ area: 'settings', where, message: `нет строки settings:groups.${field.group}` })
		}
		return issues
	})
}

/** Коды ошибок API, которые не показываются человеку в интерфейсе (ответы внешним системам) — с причиной. */
export const NOT_UI_ERROR_CODES: Readonly<Record<string, string>> = {
	WEBHOOK_BODY_INVALID: 'ответ провайдеру вебхука, не пользователю',
	WEBHOOK_PROVIDER_UNKNOWN: 'ответ провайдеру вебхука, не пользователю',
	WEBHOOK_SIGNATURE_INVALID: 'ответ провайдеру вебхука, не пользователю',
	WEBHOOK_TOO_LARGE: 'ответ провайдеру вебхука, не пользователю',
}

/** Коды ошибок в исходниках: вызовы fail.*(код), поля code/message с кодом, коды refine/regex контрактов. */
export function errorCodesIn(source: string): string[] {
	const codes = new Set<string>()
	for (const re of [/fail\.\w+\(\s*'([A-Z][A-Z0-9_]+)'/g, /\b(?:code|message):\s*'([A-Z][A-Z0-9_]+)'/g])
		for (const m of source.matchAll(re)) if (m[1]) codes.add(m[1])
	// код — последним аргументом проверки zod: .refine((s) => …, 'КОД') — в стрелке бывают свои скобки
	for (const line of source.split('\n')) {
		if (!/\.(?:regex|refine|superRefine|min|max|length)\(/.test(line)) continue
		const m = /,\s*'([A-Z][A-Z0-9_]+)'\s*\)\s*[,;]?\s*$/.exec(line)
		if (m?.[1]) codes.add(m[1])
	}
	return [...codes]
}

/** Каждый код ошибки, который может увидеть человек, есть в errors.json (иначе — «Не удалось выполнить действие»). */
export function errorCodeIssues(files: { path: string; source: string }[], errors: Strings): Issue[] {
	const issues: Issue[] = []
	const seen = new Set<string>()
	for (const f of files)
		for (const code of errorCodesIn(f.source)) {
			if (seen.has(code) || code in errors || code in NOT_UI_ERROR_CODES) continue
			seen.add(code)
			issues.push({
				area: 'errors',
				where: f.path,
				message: `нет текста errors:${code} (packages/i18n/locales/ru/errors.json)`,
			})
		}
	return issues
}

/** Таблицы из модуля схемы (db-schema.ts): всё, что экспортировано и является таблицей. */
export const tablesOf = (schema: Record<string, unknown>): PgTable[] =>
	(Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable))
