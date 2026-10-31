// Rate limit процедур (скилл security-baseline): окно, субъекты не мешают друг другу, 429 с кодом, очистка старых окон.
import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/client'
import { like } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from '#/kernel/db/client.ts'
import { runJob } from '#/kernel/worker-runtime.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { hit, requestLimitsCleanupJob } from './rate-limit.ts'
import { requestLimits } from './schema.ts'

afterAll(async () => {
	await db.delete(requestLimits).where(like(requestLimits.key, 'probe.%'))
	await cleanupTestSchools()
	await pool.end()
})

const probe = { name: `probe.${randomUUID().slice(0, 8)}`, max: 2, windowSeconds: 60, by: 'user' as const }

describe('счётчик окна', () => {
	it('считает попытки в окне, новое окно — с единицы; субъекты раздельно', async () => {
		const t0 = new Date('2026-10-31T10:00:05Z')
		expect((await hit(probe, 'user:a', t0)).count).toBe(1)
		const second = await hit(probe, 'user:a', new Date('2026-10-31T10:00:50Z'))
		expect(second).toEqual({ count: 2, retryAfter: 10 })
		expect((await hit(probe, 'user:b', t0)).count).toBe(1)
		expect((await hit(probe, 'user:a', new Date('2026-10-31T10:01:00Z'))).count).toBe(1)
	})

	it('в ключе нет субъекта открытым текстом (IP — ПДн)', async () => {
		await hit(probe, 'ip::203.0.113.7', new Date())
		const keys = (
			await db
				.select()
				.from(requestLimits)
				.where(like(requestLimits.key, `${probe.name}:%`))
		).map((r) => r.key)
		expect(keys.join()).not.toContain('203.0.113.7')
	})

	it('очистка удаляет окна старше суток', async () => {
		await hit(probe, 'user:old', new Date(Date.now() - 2 * 24 * 3600 * 1000))
		await hit(probe, 'user:fresh', new Date())
		await runJob(requestLimitsCleanupJob, { data: {} }, { jobId: 'test' })
		const rows = await db
			.select()
			.from(requestLimits)
			.where(like(requestLimits.key, `${probe.name}:%`))
		expect(rows.every((r) => r.windowStart.getTime() > Date.now() - 24 * 3600 * 1000)).toBe(true)
		expect(rows.length).toBeGreaterThan(0)
	})
})

describe('лимит на процедуре', () => {
	it('приглашения: 31-е за час — 429 RATE_LIMITED; другой участник и другая школа не страдают', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const invite = (t: typeof a, role: 'owner' | 'admin', n: number) =>
			t
				.as(role)
				.invitations.create({ email: `rl-${role}-${n}-${randomUUID().slice(0, 6)}@example.com`, role: 'teacher' })

		for (let i = 0; i < 30; i++) await invite(a, 'owner', i)
		const error = await invite(a, 'owner', 30).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(ORPCError)
		expect(error).toMatchObject({ status: 429, data: { code: 'RATE_LIMITED' } })
		expect((error as ORPCError<string, { retryAfter: number }>).data.retryAfter).toBeGreaterThan(0)

		await expect(invite(a, 'admin', 0)).resolves.toMatchObject({ id: expect.any(String) })
		await expect(invite(b, 'owner', 0)).resolves.toMatchObject({ id: expect.any(String) })
	})
})
