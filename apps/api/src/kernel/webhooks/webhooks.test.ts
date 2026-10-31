// Вебхуки (скилл integrations): подпись, идемпотентность по id события, обработка задачей в транзакции школы,
// изоляция школ, ошибки маршрута.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { members } from '#/kernel/members/schema.ts'
import { registerWebhookHandlers } from '#/kernel/registry.ts'
import { app } from '#/test/http.ts'
import { drainJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { defineWebhookHandler } from './define.ts'
import { fakeSignature } from './providers/fake.ts'
import { webhookEvents } from './schema.ts'

// Что сделал обработчик: школа события и сколько участников видно в её транзакции (RLS).
const handled: { externalId: string; schoolId: string; amount: number; membersInTx: number }[] = []

registerWebhookHandlers([
	defineWebhookHandler({
		provider: 'fake',
		type: 'probe.paid',
		schema: z.object({ amount: z.number() }),
		async handle(ctx, data, event) {
			const rows = await ctx.db.select({ schoolId: members.schoolId }).from(members)
			handled.push({
				externalId: event.externalId,
				schoolId: ctx.school.id,
				amount: data.amount,
				membersInTx: rows.length,
			})
		},
	}),
])

let a: TestSchool
let b: TestSchool

beforeAll(async () => {
	a = await withTestSchool()
	b = await withTestSchool()
	await startTestWorker()
})

afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

function send(schoolId: string, body: unknown, opts: { provider?: string; signature?: string } = {}) {
	const raw = typeof body === 'string' ? body : JSON.stringify(body)
	return app.request(`/api/webhooks/${opts.provider ?? 'fake'}/${schoolId}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-fake-signature': opts.signature ?? fakeSignature(raw) },
		body: raw,
	})
}

const eventsOf = (schoolId: string) => withTenant(schoolId, (tx) => tx.select().from(webhookEvents))

describe('вебхуки', () => {
	it('событие обрабатывается один раз, сколько бы раз провайдер его ни прислал', async () => {
		const id = `evt-${randomUUID()}`
		const body = { id, type: 'probe.paid', data: { amount: 990 } }

		const first = await send(a.school.id, body)
		expect(first.status).toBe(200)
		expect(await first.json()).toEqual({ ok: true, duplicate: false })
		const again = await send(a.school.id, body)
		expect(await again.json()).toEqual({ ok: true, duplicate: true })
		await drainJobs()
		await send(a.school.id, body)
		await drainJobs()

		expect(handled.filter((h) => h.externalId === id)).toEqual([
			{ externalId: id, schoolId: a.school.id, amount: 990, membersInTx: 5 },
		])
		const events = (await eventsOf(a.school.id)).filter((e) => e.externalId === id)
		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({ status: 'processed', provider: 'fake', type: 'probe.paid' })
		expect(events[0]?.processedAt).toBeInstanceOf(Date)
	})

	it('тот же id события в другой школе — отдельное событие этой школы', async () => {
		const id = `evt-${randomUUID()}`
		await send(a.school.id, { id, type: 'probe.paid', data: { amount: 1 } })
		await send(b.school.id, { id, type: 'probe.paid', data: { amount: 2 } })
		await drainJobs()
		expect(
			handled
				.filter((h) => h.externalId === id)
				.map((h) => [h.schoolId, h.amount])
				.sort(),
		).toEqual(
			[
				[a.school.id, 1],
				[b.school.id, 2],
			].sort(),
		)
		expect((await eventsOf(b.school.id)).map((e) => e.externalId)).toEqual([id])
	})

	it('неверная подпись — 401 и ничего не записано', async () => {
		const body = JSON.stringify({ id: `evt-${randomUUID()}`, type: 'probe.paid', data: { amount: 5 } })
		const res = await send(b.school.id, body, { signature: fakeSignature(body, 'wrong-secret-0000000') })
		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({ code: 'WEBHOOK_SIGNATURE_INVALID' })
		const tampered = await send(b.school.id, body.replace('5', '500'), { signature: fakeSignature(body) })
		expect(tampered.status).toBe(401)
		expect(await eventsOf(b.school.id)).toHaveLength(1) // только событие прошлого теста
	})

	it('нет обработчика — событие ignored; неизвестный провайдер, школа, тело — ошибки', async () => {
		const id = `evt-${randomUUID()}`
		expect((await send(a.school.id, { id, type: 'probe.unknown', data: {} })).status).toBe(200)
		await drainJobs()
		expect((await eventsOf(a.school.id)).find((e) => e.externalId === id)?.status).toBe('ignored')

		expect((await send(a.school.id, { id, type: 'x', data: {} }, { provider: 'nope' })).status).toBe(404)
		expect((await send(randomUUID(), { id, type: 'x', data: {} })).status).toBe(404)
		expect((await send('not-a-uuid', { id, type: 'x', data: {} })).status).toBe(404)
		expect((await send(a.school.id, '{"oops":')).status).toBe(400)
	})
})
