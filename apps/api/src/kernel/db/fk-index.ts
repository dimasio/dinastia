// Индекс под каждым внешним ключом (5.2, скилл performance): без него удаление родителя (урока, участника, файла) и выборки по
// ключу перебирают всю дочернюю таблицу. Индекс подходит, если его первые колонки — колонки ключа (обычно `school_id`, `<ключ>`).
import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'

/** Внешние ключи схемы public без индекса с этими колонками в начале: `таблица(колонки)`. */
export async function findUnindexedForeignKeys(db: Db, exclude: RegExp = /^kernel_probe_|_probe$/): Promise<string[]> {
	const { rows } = await db.execute<{ fk: string }>(sql`
		with fk as (
			select c.conrelid, c.conrelid::regclass::text as tbl,
				array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o)
					join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as cols
			from pg_constraint c
			join pg_namespace ns on ns.oid = c.connamespace and ns.nspname = 'public'
			where c.contype = 'f'
		), idx as (
			select i.indrelid,
				array(select a.attname::text from unnest(i.indkey) with ordinality k(n, o)
					join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o) as cols
			from pg_index i
		)
		select fk.tbl || '(' || array_to_string(fk.cols, ', ') || ')' as fk from fk
		where not exists (
			select 1 from idx where idx.indrelid = fk.conrelid and idx.cols[1:array_length(fk.cols, 1)] = fk.cols
		)
		order by 1`)
	return rows.map((r) => r.fk).filter((f) => !exclude.test(f.split('(')[0] ?? ''))
}
