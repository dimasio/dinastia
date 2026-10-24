// pnpm db:migrate | db:reset — миграции под app_owner (скилл db-schema).
import { config } from '../config.ts'
import { migrateDatabase, resetDatabase } from './admin.ts'

const command = process.argv[2]
const target = new URL(config.DATABASE_URL_OWNER)

if (command === 'reset') {
	if (config.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
		throw new Error(`db:reset разрешён только для локальной БД, а не ${target.hostname}`)
	}
	await resetDatabase(config.DATABASE_URL_OWNER)
	console.log(`db:reset — схема очищена (${target.pathname.slice(1)})`)
}
if (command === 'reset' || command === 'migrate') {
	await migrateDatabase(config.DATABASE_URL_OWNER)
	console.log(`db:migrate — ok (${target.pathname.slice(1)})`)
} else {
	throw new Error(`неизвестная команда: ${command}`)
}
