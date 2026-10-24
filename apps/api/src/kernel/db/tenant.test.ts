// Изоляция школ (D-006, D-038): тест строит DDL пробных таблиц теми же хелперами, что и боевые таблицы.
import { appUser, schoolStatus, schools, tenantRef, tenantTable } from '@dinastia/db'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { eq, sql } from 'drizzle-orm'
import { text, uuid } from 'drizzle-orm/pg-core'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './client.ts'
import { withTenant } from './tenant.ts'

const parents = tenantTable('kernel_probe_parents', { title: text('title').notNull() })
const children = tenantTable('kernel_probe_children', { parentId: uuid('parent_id').notNull() }, (t) => [
	tenantRef(t, t.parentId, parents, 'cascade'),
])

const owner = () => new pg.Client({ connectionString: process.env.DATABASE_URL_OWNER })

async function asOwner(statements: string[]) {
	const client = owner()
	await client.connect()
	try {
		for (const s of statements) await client.query(s)
	} finally {
		await client.end()
	}
}

/** SQLSTATE ошибки Postgres (Drizzle кладёт исходную ошибку в cause). */
async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise
	} catch (e) {
		const cause = (e as { cause?: { code?: string } }).cause
		return cause?.code ?? (e as { code?: string }).code
	}
	throw new Error('ожидалась ошибка БД')
}

let schoolA: string
let schoolB: string

beforeAll(async () => {
	const base = { schools, schoolStatus, appUser }
	const ddl = await generateMigration(generateDrizzleJson(base), generateDrizzleJson({ ...base, parents, children }))
	await asOwner(ddl)
	const [a, b] = await db
		.insert(schools)
		.values([
			{ slug: `a-${Date.now()}`, name: 'A' },
			{ slug: `b-${Date.now()}`, name: 'B' },
		])
		.returning({ id: schools.id })
	if (!a || !b) throw new Error('школы не созданы')
	schoolA = a.id
	schoolB = b.id
})

afterAll(async () => {
	await asOwner(['DROP TABLE IF EXISTS kernel_probe_children, kernel_probe_parents CASCADE'])
	await db.delete(schools).where(sql`${schools.id} in (${schoolA}, ${schoolB})`)
	await pool.end()
})

describe('изоляция школ (RLS)', () => {
	it('school_id берётся из контекста, каждая школа видит только свои строки', async () => {
		await withTenant(schoolA, (tx) => tx.insert(parents).values({ title: 'A1' }))
		await withTenant(schoolB, (tx) => tx.insert(parents).values({ title: 'B1' }))

		const seenByA = await withTenant(schoolA, (tx) => tx.select().from(parents))
		expect(seenByA.map((r) => r.title)).toEqual(['A1'])
		expect(seenByA[0]?.schoolId).toBe(schoolA)
	})

	it('без школы в контексте — ни одной строки и запись невозможна', async () => {
		expect(await db.select().from(parents)).toEqual([])
		expect(await pgCode(db.insert(parents).values({ title: 'x' }))).toBe('42501') // RLS: school_id = NULL не проходит политику
	})

	it('нельзя записать строку с чужим school_id', async () => {
		const code = await pgCode(
			withTenant(schoolA, (tx) => tx.insert(parents).values({ title: 'evil', schoolId: schoolB })),
		)
		expect(code).toBe('42501') // insufficient_privilege: new row violates row-level security policy
	})

	it('нельзя изменить или удалить чужую строку, даже зная id', async () => {
		const [b1] = await withTenant(schoolB, (tx) => tx.select().from(parents))
		if (!b1) throw new Error('нет строки B')
		const updated = await withTenant(schoolA, (tx) =>
			tx.update(parents).set({ title: 'hacked' }).where(eq(parents.id, b1.id)).returning(),
		)
		const deleted = await withTenant(schoolA, (tx) => tx.delete(parents).where(eq(parents.id, b1.id)).returning())
		expect(updated).toEqual([])
		expect(deleted).toEqual([])
		const [still] = await withTenant(schoolB, (tx) => tx.select().from(parents).where(eq(parents.id, b1.id)))
		expect(still?.title).toBe('B1')
	})

	it('нельзя сослаться на запись другой школы (составной FK)', async () => {
		const [b1] = await withTenant(schoolB, (tx) => tx.select().from(parents))
		if (!b1) throw new Error('нет строки B')
		const code = await pgCode(withTenant(schoolA, (tx) => tx.insert(children).values({ parentId: b1.id })))
		expect(code).toBe('23503') // foreign_key_violation
		const [a1] = await withTenant(schoolA, (tx) => tx.select().from(parents))
		if (!a1) throw new Error('нет строки A')
		await withTenant(schoolA, (tx) => tx.insert(children).values({ parentId: a1.id }))
		expect(await withTenant(schoolA, (tx) => tx.select().from(children))).toHaveLength(1)
	})

	it('школа не «залипает» на соединении пула после транзакции', async () => {
		await withTenant(schoolA, (tx) => tx.select().from(parents))
		const leaked = await Promise.all(Array.from({ length: 20 }, () => db.select().from(parents)))
		expect(leaked.flat()).toEqual([])
	})
})
