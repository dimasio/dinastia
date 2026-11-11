// Под каждым внешним ключом после всех миграций — индекс (5.2, скилл performance).
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from '#/kernel/db/client.ts'
import { findUnindexedForeignKeys } from '#/kernel/db/fk-index.ts'

afterAll(() => pool.end())

describe('индексы внешних ключей', () => {
	it('у каждого внешнего ключа есть индекс с его колонками в начале', async () => {
		expect(await findUnindexedForeignKeys(db), 'добавь index().on(t.schoolId, t.<ключ>) в таблицу').toEqual([])
	})
})
