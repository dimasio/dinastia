// Задачи и события (пункт 1.6): постановка в транзакции, событие → подписчик → задача, повторы, окончательная
// ошибка, изоляция школ, обход всех школ.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { drainJobs, jobStates, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { type TestSchool, withTestSchool } from '#/test/school.ts'
import { withTenant } from './db/tenant.ts'
import { fail } from './errors.ts'
import { defineEvent, on, subscriberJob } from './events.ts'
import { defineJob } from './jobs.ts'
import { log } from './log.ts'
import { members } from './members/schema.ts'
import { registerJobs } from './registry.ts'
import { tenantCtx } from './tenant-ctx.ts'
import { runJob } from './worker-runtime.ts'

// Что видели обработчики — проверяем эффект, а не только состояние очереди.
const seen: { job: string; schoolId: string; data?: unknown; schoolsInRls?: string[] }[] = []
const attempts = new Map<string, number>()

const recordJob = defineJob({
	name: 'probe.record',
	schema: z.object({ note: z.string() }),
	handler: async (ctx, d) => {
		const rows = await ctx.db.selectDistinct({ schoolId: members.schoolId }).from(members)
		seen.push({ job: 'probe.record', schoolId: ctx.school.id, data: d, schoolsInRls: rows.map((r) => r.schoolId) })
	},
})

const flakyJob = defineJob({
	name: 'probe.flaky',
	schema: z.object({ key: z.string() }),
	retry: { limit: 2, backoff: false },
	handler: (ctx, d) => {
		const n = (attempts.get(d.key) ?? 0) + 1
		attempts.set(d.key, n)
		if (n === 1) throw new Error('сеть моргнула')
		// идемпотентно: эффект — один раз, сколько бы попыток ни было
		if (!seen.some((s) => s.job === 'probe.flaky' && s.data === d.key))
			seen.push({ job: 'probe.flaky', schoolId: ctx.school.id, data: d.key })
	},
})

const ruleJob = defineJob({
	name: 'probe.rule',
	schema: z.object({ key: z.string() }),
	retry: { limit: 3, backoff: false },
	handler: (_ctx, d) => {
		attempts.set(d.key, (attempts.get(d.key) ?? 0) + 1)
		fail.conflict('PROBE_RULE')
	},
})

const everySchool = defineJob({
	name: 'probe.every-school',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '0 3 * * *',
	handler: async (ctx) => {
		const rows = await ctx.db.selectDistinct({ schoolId: members.schoolId }).from(members)
		seen.push({ job: 'probe.every-school', schoolId: ctx.school.id, schoolsInRls: rows.map((r) => r.schoolId) })
	},
})

const somethingHappened = defineEvent('probe.happened', z.object({ note: z.string() }))
const subscriber = on(somethingHappened, async (ctx, e) => {
	seen.push({ job: 'probe.on.happened', schoolId: ctx.school.id, data: e })
	await ctx.jobs.send(recordJob, { note: `после события: ${e.note}` }) // событие → подписчик → задача
})
const subscriberAsJob = subscriberJob('probe', subscriber)

registerJobs(
	[recordJob, flakyJob, ruleJob, everySchool, subscriberAsJob],
	[{ event: somethingHappened.name, job: subscriberAsJob }],
)

let a: TestSchool
let b: TestSchool
const inSchool = <T>(s: TestSchool, fn: (ctx: ReturnType<typeof tenantCtx>) => Promise<T>) =>
	withTenant(s.school.id, (tx) => fn(tenantCtx(tx, s.school, { now: () => new Date(), log })))

beforeAll(async () => {
	;[a, b] = await Promise.all([withTestSchool('Школа А'), withTestSchool('Школа Б')])
	await startTestWorker()
})
afterAll(async () => {
	await stopTestWorker()
	await Promise.all([a.cleanup(), b.cleanup()])
})

describe('ctx.jobs.send', () => {
	it('задача ставится в транзакции запроса: откат — задачи нет, коммит — выполнена в своей школе', async () => {
		await expect(
			inSchool(a, async (ctx) => {
				await ctx.jobs.send(recordJob, { note: 'откат' })
				throw new Error('откат транзакции')
			}),
		).rejects.toThrow('откат транзакции')
		await inSchool(a, (ctx) => ctx.jobs.send(recordJob, { note: 'коммит' }))
		await drainJobs()

		const runs = seen.filter((s) => s.job === 'probe.record')
		expect(runs.map((r) => (r.data as { note: string }).note)).toEqual(['коммит'])
		// контекст задачи — школа А, и RLS показывает только её участников
		expect(runs[0]?.schoolId).toBe(a.school.id)
		expect(runs[0]?.schoolsInRls).toEqual([a.school.id])
	})

	it('данные проверяются схемой задачи до постановки', async () => {
		await expect(inSchool(a, (ctx) => ctx.jobs.send(recordJob, { note: 5 } as never))).rejects.toThrow()
	})
})

describe('ctx.emit', () => {
	it('событие → подписчик → задача; откат транзакции — события не было', async () => {
		seen.length = 0
		await expect(
			inSchool(b, async (ctx) => {
				await ctx.emit(somethingHappened, { note: 'не случилось' })
				throw new Error('откат')
			}),
		).rejects.toThrow('откат')
		await inSchool(b, (ctx) => ctx.emit(somethingHappened, { note: 'урок пройден' }))
		await drainJobs()

		expect(seen.map((s) => [s.job, s.schoolId])).toEqual([
			['probe.on.happened', b.school.id],
			['probe.record', b.school.id],
		])
		expect(seen[1]?.data).toEqual({ note: 'после события: урок пройден' })
	})
})

describe('повторы', () => {
	it('сбой — повтор; эффект — один раз', async () => {
		seen.length = 0
		await inSchool(a, (ctx) => ctx.jobs.send(flakyJob, { key: 'flaky-1' }))
		await drainJobs()
		expect(attempts.get('flaky-1')).toBe(2)
		expect(seen.filter((s) => s.job === 'probe.flaky')).toHaveLength(1)
		expect((await jobStates('probe.flaky')).map((j) => j.state)).toEqual(['completed'])
	})

	it('ошибка бизнес-правила (fail.*) — без повторов, задача failed', async () => {
		await inSchool(a, (ctx) => ctx.jobs.send(ruleJob, { key: 'rule-1' }))
		await drainJobs()
		expect(attempts.get('rule-1')).toBe(1)
		expect((await jobStates('probe.rule')).map((j) => j.state)).toEqual(['failed'])
	})
})

describe('scope all-schools', () => {
	it('обходит активные школы, у каждой — своя транзакция и свои данные', async () => {
		seen.length = 0
		await runJob(everySchool, { data: {} }, { jobId: 'test' })
		const runs = seen.filter((s) => s.job === 'probe.every-school')
		const bySchool = new Map(runs.map((r) => [r.schoolId, r.schoolsInRls]))
		expect(bySchool.get(a.school.id)).toEqual([a.school.id])
		expect(bySchool.get(b.school.id)).toEqual([b.school.id])
	})

	it('у задачи школы не бывает расписания; задачу всех школ нельзя поставить из запроса', async () => {
		expect(() =>
			defineJob({ name: 'probe.bad', schema: z.object({}), schedule: '* * * * *', handler: () => {} }),
		).toThrow(/all-schools/)
		await expect(inSchool(a, (ctx) => ctx.jobs.send(everySchool, {}))).rejects.toThrow(/расписание/)
	})
})
