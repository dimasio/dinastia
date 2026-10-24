import { migrateDatabase, resetDatabase } from '../kernel/db/admin.ts'

/** Перед прогоном: чистая тестовая база со всеми миграциями. */
export default async function setup() {
	const ownerUrl = process.env.DATABASE_URL_TEST_OWNER
	if (!ownerUrl) throw new Error('нет DATABASE_URL_TEST_OWNER (скилл local-env)')
	await resetDatabase(ownerUrl)
	await migrateDatabase(ownerUrl)
}
