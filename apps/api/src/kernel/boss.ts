// pg-boss (D-008): схема `pgboss` в той же БД. Ставит и обновляет её db:migrate под app_owner; приложение и воркер
// работают под app_user только с DML (migrate: false) — DDL у приложения нет, как и в public.
import pg from 'pg'
import { PgBoss } from 'pg-boss'
import { config } from './config.ts'

export const BOSS_SCHEMA = config.BOSS_SCHEMA

let sender: Promise<PgBoss> | null = null

/** Экземпляр для постановки задач из запросов: без опроса очередей, расписаний и обслуживания. */
export function boss(): Promise<PgBoss> {
	sender ??= new PgBoss({
		connectionString: config.DATABASE_URL,
		schema: BOSS_SCHEMA,
		max: 2,
		migrate: false,
		createSchema: false,
		schedule: false,
		supervise: false,
	}).start()
	return sender
}

/** Экземпляр воркера: выполняет задачи, ставит задачи по расписанию, обслуживает очереди (архив, зависшие). */
export function workerBoss(): PgBoss {
	return new PgBoss({
		connectionString: config.DATABASE_URL,
		schema: BOSS_SCHEMA,
		max: 5,
		migrate: false,
		createSchema: false,
	})
}

export async function stopBoss() {
	const b = sender
	sender = null
	if (b) await (await b).stop({ graceful: true })
}

/** Поставить/обновить схему pg-boss под владельцем и выдать app_user права на данные (без DDL). */
export async function installBoss(ownerUrl: string, schema = BOSS_SCHEMA) {
	const owner = new PgBoss({
		connectionString: ownerUrl,
		schema,
		max: 1,
		schedule: false,
		supervise: false,
	})
	await owner.start()
	await owner.stop({ graceful: false })
	const client = new pg.Client({ connectionString: ownerUrl })
	await client.connect()
	try {
		await client.query(`
			GRANT USAGE ON SCHEMA ${schema} TO app_user;
			GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO app_user;
			GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO app_user;
			GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO app_user;
			ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
			ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO app_user;
			ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT EXECUTE ON FUNCTIONS TO app_user;
		`)
	} finally {
		await client.end()
	}
}
