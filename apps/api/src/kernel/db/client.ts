import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../db-schema.ts'
import { config } from '../config.ts'

export type Schema = typeof schema
export type Db = NodePgDatabase<Schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Пул под ролью app_user (RLS действует). Только для ядра: модули работают через `ctx.db` (скилл data-access).
 */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 })

export const db: Db = drizzle({ client: pool, schema })
