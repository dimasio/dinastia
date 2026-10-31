// pii() (D-022): пометка колонок ПДн видна ядру, и ни одна такая колонка не попадёт в лог открытым текстом.
import { isPii } from '@dinastia/db'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from '#/db-schema.ts'
import { SECRET_KEYS } from './log.ts'

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable))
const piiColumns = tables.flatMap((t) =>
	Object.entries(getTableColumns(t))
		.filter(([, c]) => isPii(c))
		.map(([key]) => ({ table: getTableName(t), key })),
)

describe('pii()', () => {
	it('помечены известные поля ПДн', () => {
		const names = piiColumns.map((c) => `${c.table}.${c.key}`)
		expect(names).toEqual(
			expect.arrayContaining(['users.email', 'users.name', 'sessions.ipAddress', 'invitations.email', 'audit_log.ip']),
		)
		expect(names).not.toContain('users.id')
	})

	it('ключ каждой pii-колонки маскируется в логах', () => {
		const unmasked = piiColumns.filter((c) => !SECRET_KEYS.includes(c.key)).map((c) => `${c.table}.${c.key}`)
		expect(unmasked, 'добавь ключ в SECRET_KEYS (kernel/log.ts)').toEqual([])
	})
})
