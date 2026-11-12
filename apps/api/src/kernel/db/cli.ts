// pnpm db:migrate | db:reset [--force] — миграции под app_owner (скилл db-schema).
import { config } from '../config.ts'
import { migrateDatabase, otherConnections, resetDatabase } from './admin.ts'

const command = process.argv[2]
const target = new URL(config.DATABASE_URL_OWNER)

if (command === 'reset') {
	if (config.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
		throw new Error(`db:reset разрешён только для локальной БД, а не ${target.hostname}`)
	}
	// сброс под запущенным сервером удаляет и очереди задач, которые он создаёт только при старте: дальше любое действие,
	// ставящее задачу (сдача теста → письмо), падает 500 «Queue … does not exist»
	const connected = await otherConnections(config.DATABASE_URL_OWNER)
	if (connected > 0 && !process.argv.includes('--force')) {
		console.error(
			`db:reset — отменён: к базе ${target.pathname.slice(1)} подключено ещё ${connected} (запущен pnpm dev или Drizzle Studio?).\n` +
				'Остановите их и повторите; сбросить всё равно — pnpm db:reset --force, затем перезапустить pnpm dev.',
		)
		process.exit(1)
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
