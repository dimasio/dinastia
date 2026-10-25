import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { BOSS_SCHEMA, installBoss } from '../boss.ts'

export const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

/** Применить миграции под ролью владельца схемы (app_owner) и поставить/обновить схему очереди задач (pg-boss). */
export async function migrateDatabase(ownerUrl: string) {
	const client = new pg.Client({ connectionString: ownerUrl })
	await client.connect()
	try {
		await migrate(drizzle({ client }), { migrationsFolder })
	} finally {
		await client.end()
	}
	await installBoss(ownerUrl)
}

/** Удалить все объекты приложения в схеме public и журнал миграций. Только локально и в тестах. */
export async function resetDatabase(ownerUrl: string) {
	const client = new pg.Client({ connectionString: ownerUrl })
	await client.connect()
	try {
		await client.query(`
			DO $$ DECLARE r record; BEGIN
				FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
					EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
				END LOOP;
				FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
					WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
					EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
				END LOOP;
			END $$;
			DROP SCHEMA IF EXISTS drizzle CASCADE;
			DROP SCHEMA IF EXISTS ${BOSS_SCHEMA} CASCADE;
		`)
	} finally {
		await client.end()
	}
}
