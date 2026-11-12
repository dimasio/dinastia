// База e2e (tests/e2e/env.ts): создать dinastia_e2e, если её нет, — в томе, созданном до её появления в
// docker/postgres/init.sh. Права — как там. Только локальный Postgres из docker/compose.yml.
import pg from 'pg'
import { config } from '../kernel/config.ts'

const target = new URL(config.DATABASE_URL_OWNER)
const name = target.pathname.slice(1)
if (config.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(target.hostname) || !name.endsWith('_e2e'))
	throw new Error(`e2e-db — только для локальной базы *_e2e, а не ${target.hostname}/${name}`)

const admin = new pg.Client({ connectionString: `postgres://postgres:postgres@${target.host}/postgres` })
await admin.connect()
try {
	const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name])
	if (!rowCount) {
		await admin.query(`CREATE DATABASE ${name} OWNER app_owner`)
		const db = new pg.Client({ connectionString: `postgres://postgres:postgres@${target.host}/${name}` })
		await db.connect()
		try {
			await db.query(`
				REVOKE ALL ON DATABASE ${name} FROM PUBLIC;
				GRANT CONNECT ON DATABASE ${name} TO app_user;
				REVOKE CREATE ON SCHEMA public FROM PUBLIC;
				ALTER SCHEMA public OWNER TO app_owner;
				GRANT USAGE ON SCHEMA public TO app_user;
				ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
				ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
				ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user;
			`)
		} finally {
			await db.end()
		}
		console.log(`e2e-db — создана ${name}`)
	}
} finally {
	await admin.end()
}
