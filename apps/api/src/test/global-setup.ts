import pg from 'pg'
import { migrateDatabase, resetDatabase } from '../kernel/db/admin.ts'
import { probeDdl } from './probes.ts'

/** Перед прогоном: чистая тестовая база со всеми миграциями и пробными таблицами тестов ядра (test/probes.ts). */
export default async function setup() {
	const ownerUrl = process.env.DATABASE_URL_TEST_OWNER
	if (!ownerUrl) throw new Error('нет DATABASE_URL_TEST_OWNER (скилл local-env)')
	await resetDatabase(ownerUrl)
	await migrateDatabase(ownerUrl)
	const client = new pg.Client({ connectionString: ownerUrl })
	await client.connect()
	try {
		for (const statement of await probeDdl()) await client.query(statement)
	} finally {
		await client.end()
	}
}
