import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'

/**
 * Глобальные таблицы, где `school_id` — только ссылка, а данные принадлежат человеку, а не школе. Каждое исключение —
 * с причиной; новое — с согласия человека (скилл security-baseline).
 */
export const GLOBAL_TABLES_WITH_SCHOOL_REF: Record<string, string> = {
	consents: 'согласия принадлежат пользователю (152-ФЗ, D-022); school_id — в какой школе дано согласие',
	ops_audit:
		'журнал консоли оператора (5.6): читает только оператор, school_id — о какой школе действие, без FK (школа удаляется)',
}

/** Таблицы public с колонкой school_id без включённого RLS или без политики (инвариант ядра D-006). */
export async function findUnprotectedTenantTables(db: Db, exclude: RegExp = /^kernel_probe_/): Promise<string[]> {
	const { rows } = await db.execute<{ table: string; rls: boolean; policies: number }>(sql`
		select c.relname as table, c.relrowsecurity as rls,
			(select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
		join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped
		where c.relkind = 'r'
	`)
	return rows
		.filter((r) => !exclude.test(r.table) && !(r.table in GLOBAL_TABLES_WITH_SCHOOL_REF))
		.filter((r) => !r.rls || r.policies === 0)
		.map((r) => r.table)
}
