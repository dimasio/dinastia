import { type SQL, sql } from 'drizzle-orm'
import {
	type AnyPgColumn,
	foreignKey,
	type PgColumnBuilderBase,
	type PgTableExtraConfigValue,
	pgPolicy,
	pgTable,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'
import { appUser } from './roles.ts'
import { schools } from './schools.ts'

/** Текущая школа транзакции; не задана — NULL, и RLS не пропускает ни одной строки. */
export const currentSchoolId: SQL = sql`nullif(current_setting('app.school_id', true), '')::uuid`

/** Общие колонки тенантной таблицы. `school_id` по умолчанию берётся из контекста транзакции — руками не пишется. */
export function tenantColumns() {
	return {
		id: uuid('id').primaryKey().default(sql`uuidv7()`),
		schoolId: uuid('school_id')
			.notNull()
			.default(currentSchoolId)
			.references(() => schools.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	}
}

type TenantColumns = ReturnType<typeof tenantColumns>

/**
 * Тенантная таблица (D-006, D-038): колонки `tenantColumns()` добавляются сами, RLS включён, политика пускает только
 * строки текущей школы (чтение и запись), `unique (school_id, id)` — цель составных внешних ключей `tenantRef`.
 */
export function tenantTable<TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
	extraConfig?: (
		t: ReturnType<typeof pgTable<TName, TColumns & TenantColumns>>['_']['columns'],
	) => PgTableExtraConfigValue[],
) {
	return pgTable(name, { ...tenantColumns(), ...columns } as TColumns & TenantColumns, (t) => [
		unique(`${name}_school_id_id_key`).on(t.schoolId, t.id),
		pgPolicy(`${name}_tenant_isolation`, {
			as: 'permissive',
			for: 'all',
			to: appUser,
			using: sql`${t.schoolId} = ${currentSchoolId}`,
			withCheck: sql`${t.schoolId} = ${currentSchoolId}`,
		}),
		...(extraConfig?.(t as never) ?? []),
	]).enableRLS()
}

type TenantRefAction = 'cascade' | 'restrict' | 'no action'

/**
 * Внешний ключ между тенантными таблицами — составной `(school_id, <колонка>) → цель(school_id, id)` (D-038):
 * сослаться на запись другой школы невозможно, даже зная её id. `set null` не поддерживается (обнулил бы school_id).
 */
export function tenantRef(
	from: { schoolId: AnyPgColumn },
	column: AnyPgColumn,
	target: { schoolId: AnyPgColumn; id: AnyPgColumn },
	onDelete: TenantRefAction,
) {
	return foreignKey({ columns: [from.schoolId, column], foreignColumns: [target.schoolId, target.id] }).onDelete(
		onDelete,
	)
}
