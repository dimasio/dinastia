// Каждая таблица с school_id после всех миграций — под RLS с политикой (инвариант ядра, скилл core-kernel).
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from '#/kernel/db/client.ts'
import { findUnprotectedTenantTables } from '#/kernel/db/rls-coverage.ts'

afterAll(() => pool.end())

describe('покрытие RLS', () => {
	it('все таблицы с school_id после миграций защищены', async () => {
		expect(await findUnprotectedTenantTables(db)).toEqual([])
	})

	it('проверка ловит таблицу без RLS', async () => {
		const owner = new pg.Client({ connectionString: process.env.DATABASE_URL_OWNER })
		await owner.connect()
		try {
			await owner.query('create table rls_negative_probe (id int, school_id uuid)')
			expect(await findUnprotectedTenantTables(db)).toContain('rls_negative_probe')
		} finally {
			await owner.query('drop table if exists rls_negative_probe')
			await owner.end()
		}
	})
})
