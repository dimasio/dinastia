// Настройки школы (скилл settings, D-036, D-053): таблица модуля `<модуль>_settings` (строка на школу, колонки с
// default) + defineSettings — метаданные поверх колонок: схема значения, группа экрана, кто меняет. Чтение — по
// определению: `ctx.settings.get(learningSettings, 'selfEnrollByLink')` — тип значения и имя проверяет компилятор.
import type { MemberRole } from '@dinastia/contracts/schools'
import { eq, getTableColumns, getTableName } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'
import { type Audit, auditFor } from '../audit/audit.ts'
import type { Tx } from '../db/client.ts'
import { fail } from '../errors.ts'

/** Таблица настроек — из `settingsTable()` (`@dinastia/db`): PK `school_id`, `updated_at`. */
export type SettingsTable = PgTable & { schoolId: AnyPgColumn; updatedAt: AnyPgColumn }

/** Колонки настроек (без служебных) → значение строки. */
type Values<T extends SettingsTable> = Omit<T['$inferSelect'], 'schoolId' | 'updatedAt'>

export interface SettingField<V> {
	/** Проверка значения при изменении (границы, формат); тип — как у колонки. */
	schema: z.ZodType<V>
	/** Раздел экрана /admin/settings (строки — `settings:groups.<группа>`). */
	group: string
	/** Кто меняет (owner — всегда); `[]` — только оператор SaaS (фича-флаг школы, D-026). */
	edit: readonly MemberRole[]
}

export interface SettingsDef<M extends string = string, T extends SettingsTable = SettingsTable> {
	/** Модуль = префикс ключей `<модуль>.<имя>` и строк `settings:<модуль>.<имя>.title|description`. */
	module: M
	table: T
	fields: { [K in keyof Values<T>]: SettingField<Values<T>[K]> }
}

// biome-ignore lint/suspicious/noExplicitAny: у каждого модуля своя таблица — для реестров
export type AnySettingsDef = SettingsDef<string, any>

const SERVICE = ['schoolId', 'updatedAt']

/** Расхождения определения и таблицы: поле = колонка, каждая колонка описана (основа check:registries). */
export function settingsIssues(def: AnySettingsDef): string[] {
	const issues: string[] = []
	const expected = `${def.module.replaceAll('-', '_')}_settings`
	if (getTableName(def.table) !== expected) issues.push(`таблица ${getTableName(def.table)}, ожидалась ${expected}`)
	const columns = Object.keys(getTableColumns(def.table)).filter((c) => !SERVICE.includes(c))
	const fields = Object.keys(def.fields)
	for (const f of fields) if (!columns.includes(f)) issues.push(`поле ${f} — нет такой колонки`)
	for (const c of columns) if (!fields.includes(c)) issues.push(`колонка ${c} не описана в defineSettings`)
	for (const [name, column] of Object.entries(getTableColumns(def.table) as Record<string, AnyPgColumn>))
		if (!SERVICE.includes(name) && !column.hasDefault && column.notNull)
			issues.push(`колонка ${name} без default — у новых школ строки настроек нет, значение взять неоткуда`)
	return issues
}

export function defineSettings<const M extends string, T extends SettingsTable>(
	module: M,
	table: T,
	fields: SettingsDef<M, T>['fields'],
): SettingsDef<M, T> {
	const def = { module, table, fields }
	const issues = settingsIssues(def as AnySettingsDef)
	if (issues.length) throw new Error(`настройки ${module}: ${issues.join('; ')}`)
	return def
}

export interface Settings {
	/** Значение настройки школы; строки ещё нет — default колонки (строка создаётся). */
	get<T extends SettingsTable, K extends keyof Values<T> & string>(
		def: SettingsDef<string, T>,
		name: K,
	): Promise<Values<T>[K]>
	/** Все настройки модуля. */
	all<T extends SettingsTable>(def: SettingsDef<string, T>): Promise<Values<T>>
}

/** Строка настроек школы: нет — создать с default колонок (школа видит только свою — RLS). */
async function row(tx: Tx, def: AnySettingsDef): Promise<Record<string, unknown>> {
	const [existing] = await tx.select().from(def.table).limit(1)
	if (existing) return existing as Record<string, unknown>
	await tx.insert(def.table).values({}).onConflictDoNothing()
	const [created] = await tx.select().from(def.table).limit(1)
	if (!created) throw new Error(`настройки ${def.module}: строка не создана`)
	return created as Record<string, unknown>
}

const values = (def: AnySettingsDef, r: Record<string, unknown>) =>
	Object.fromEntries(Object.keys(def.fields).map((k) => [k, r[k]]))

export function settingsFor(tx: Tx): Settings {
	return {
		get: async (def, name) => (await row(tx, def as AnySettingsDef))[name] as never,
		all: async (def) => values(def as AnySettingsDef, await row(tx, def as AnySettingsDef)) as never,
	}
}

/**
 * Изменить настройки модуля (экран /admin/settings, сервис модуля): только переданные поля, каждое — по своей схеме
 * (ZodError → 400) и правам (`edit`, owner — всегда); изменение — в журнал действий.
 */
export async function updateSettings<T extends SettingsTable>(
	ctx: { db: Tx; member: { role: MemberRole }; audit: Audit },
	def: SettingsDef<string, T>,
	patch: Partial<Values<T>>,
): Promise<Values<T>> {
	const fields = def.fields as Record<string, SettingField<unknown>>
	const current = await row(ctx.db, def as AnySettingsDef)
	const set: Record<string, unknown> = {}
	const diff: Record<string, { from: unknown; to: unknown }> = {}
	for (const [name, value] of Object.entries(patch)) {
		const field = fields[name]
		if (!field) return fail.invalid('SETTING_UNKNOWN', { name })
		// флаг (`edit: []`) — только оператор в консоли (5.6д), даже владельцу нельзя
		if (isFlag(field) || (ctx.member.role !== 'owner' && !field.edit.includes(ctx.member.role)))
			return fail.forbidden('SETTING_FORBIDDEN', { name })
		set[name] = field.schema.parse(value)
		if (current[name] !== set[name]) diff[name] = { from: current[name], to: set[name] }
	}
	if (Object.keys(diff).length) {
		await ctx.db
			.update(def.table)
			.set(set as never)
			.where(eq(def.table.schoolId, current.schoolId))
		await ctx.audit(`settings.${def.module.replaceAll('_', '-')}.changed`, {
			entity: 'school-settings',
			id: current.schoolId as string,
			diff,
		})
	}
	return values(def as AnySettingsDef, { ...current, ...set }) as Values<T>
}

/** Фича-флаг школы — поле с `edit: []`: школа его не видит, меняет только оператор в консоли (5.6д). */
export const isFlag = (field: SettingField<unknown>) => field.edit.length === 0

/**
 * Изменить фича-флаги школы оператором (5.6д): только поля-флаги, по их схеме; в журнал школы — с оператором. `tx` —
 * транзакция этой школы (`withTenant`).
 */
export async function updateFlags(
	tx: Tx,
	def: AnySettingsDef,
	patch: Record<string, unknown>,
	operator: { id: string; ip: string | null },
) {
	const fields = def.fields as Record<string, SettingField<unknown>>
	const current = await row(tx, def)
	const set: Record<string, unknown> = {}
	const diff: Record<string, { from: unknown; to: unknown }> = {}
	for (const [name, value] of Object.entries(patch)) {
		const field = fields[name]
		if (!field || !isFlag(field)) return fail.invalid('SETTING_UNKNOWN', { name })
		set[name] = field.schema.parse(value)
		if (current[name] !== set[name]) diff[name] = { from: current[name], to: set[name] }
	}
	if (Object.keys(diff).length) {
		await tx
			.update(def.table)
			.set(set as never)
			.where(eq(def.table.schoolId, current.schoolId))
		await auditFor(tx, { memberId: null, operatorId: operator.id, ip: operator.ip })(
			`settings.${def.module.replaceAll('_', '-')}.flag-changed`,
			{ entity: 'school-settings', id: current.schoolId as string, diff },
		)
	}
	return values(def, { ...current, ...set })
}
