// Настройки школы (скилл settings): таблица модуля `<module>_settings` — строка на школу, настройки — колонки с default.
import { type PgColumnBuilderBase, pgTable, timestamp } from 'drizzle-orm/pg-core'
import { schoolIdColumn, tenantIsolation } from './tenant.ts'

type SettingsColumns = {
	schoolId: ReturnType<typeof settingsSchoolId>
	updatedAt: ReturnType<typeof updatedAtColumn>
}
const settingsSchoolId = () => schoolIdColumn().primaryKey()
const updatedAtColumn = () =>
	timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())

/** Таблица настроек модуля: PK `school_id` (строка создаётся лениво), RLS; каждая колонка — с default. */
export function settingsTable<TName extends `${string}_settings`, TColumns extends Record<string, PgColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
) {
	return pgTable(
		name,
		{ schoolId: settingsSchoolId(), ...columns, updatedAt: updatedAtColumn() } as TColumns & SettingsColumns,
		(t) => [tenantIsolation(name, t.schoolId)],
	).enableRLS()
}
