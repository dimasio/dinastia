// Наблюдаемость (5.4): формат метрик Prometheus, метрики процедур; сбор ошибок — неожиданная ошибка процедуры уходит с тегами и без
// ПДн, ожидаемая (`fail.*`) — нет; готовность проверяет БД и хранилище.

import { call, ORPCError } from '@orpc/server'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '#/app.ts'
import { pool } from './db/client.ts'
import { flushErrors, initErrorReporting } from './error-report.ts'
import { fail } from './errors.ts'
import { log } from './log.ts'
import { counter, histogram, renderMetrics } from './metrics.ts'
import { impl } from './orpc.ts'

afterAll(() => pool.end())

/** Конверт Sentry: [заголовки, [[заголовок элемента, данные], …]]. */
type Envelope = [unknown, [unknown, unknown][]]
const sent: Envelope[] = []
initErrorReporting('api', {
	dsn: 'https://public@glitchtip.example/1',
	transport: () => ({
		send: async (envelope: unknown) => {
			sent.push(envelope as Envelope)
			return {}
		},
		flush: async () => true,
	}),
})

const ctx = () => ({
	headers: new Headers({ cookie: 'session=secret', 'x-email': 'student@example.com' }),
	ip: '10.0.0.1',
	now: () => new Date(),
	log,
	requestId: 'req-observability',
	tags: { schoolId: '00000000-0000-7000-8000-000000000001' } as Record<string, string>,
})

describe('метрики', () => {
	it('счётчик и гистограмма в формате Prometheus; метки экранируются', async () => {
		const c = counter('test_things_total', 'Тестовый счётчик')
		c.inc({ kind: 'a"b' })
		c.inc({ kind: 'a"b' }, 2)
		const h = histogram('test_seconds', 'Тестовая длительность', [0.1, 1])
		h.observe({ op: 'x' }, 0.5)
		const text = await renderMetrics()
		expect(text).toContain('# TYPE test_things_total counter')
		expect(text).toContain('test_things_total{kind="a\\"b"} 3')
		expect(text).toContain('test_seconds_bucket{op="x",le="0.1"} 0')
		expect(text).toContain('test_seconds_bucket{op="x",le="1"} 1')
		expect(text).toContain('test_seconds_bucket{op="x",le="+Inf"} 1')
		expect(text).toContain('test_seconds_count{op="x"} 1')
		expect(() => counter('test_things_total', 'дубль')).toThrow(/дважды/)
	})
})

describe('сбор ошибок и метрики процедур', () => {
	it('неожиданная ошибка — в сбор с процедурой и школой, без cookie, заголовков и IP; метрика ошибки', async () => {
		const boom = impl.schools.current.handler(() => {
			throw new Error('сломалось при student@example.com')
		})
		await expect(call(boom, undefined, { context: ctx(), path: ['schools', 'current'] })).rejects.toThrow()
		await flushErrors()
		const event = sent
			.flatMap((e) => e[1])
			.map((item) => item[1] as Record<string, unknown>)
			.find((p) => JSON.stringify(p).includes('сломалось'))
		expect(event).toBeDefined()
		expect(event?.tags).toMatchObject({ procedure: 'schools.current', schoolId: ctx().tags.schoolId, service: 'api' })
		const json = JSON.stringify(event)
		expect(json).not.toContain('session=secret')
		expect(json).not.toContain('10.0.0.1')
		expect(event?.request).toBeUndefined()
		expect(event?.user).toBeUndefined()
		const text = await renderMetrics()
		expect(text).toMatch(/rpc_errors_total\{code="500",procedure="schools.current"\} \d+/)
		expect(text).toMatch(/rpc_duration_seconds_count\{procedure="schools.current",status="error"\} \d+/)
	})

	it('ожидаемая ошибка (fail.*) — не в сбор, в метриках — как ошибка клиента', async () => {
		const before = sent.length
		const notFound = impl.schools.current.handler(() => fail.notFound('SCHOOL_NOT_FOUND'))
		await expect(call(notFound, undefined, { context: ctx(), path: ['schools', 'current'] })).rejects.toBeInstanceOf(
			ORPCError,
		)
		await flushErrors()
		expect(sent.length).toBe(before)
		expect(await renderMetrics()).toMatch(
			/rpc_duration_seconds_count\{procedure="schools.current",status="client_error"\}/,
		)
	})
})

describe('готовность', () => {
	it('/health/ready проверяет БД и хранилище файлов', async () => {
		const res = await createApp().request('/health/ready')
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: 'ok', checks: { db: 'ok', s3: 'ok' } })
	})
})
