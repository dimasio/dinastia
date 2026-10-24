import { Writable } from 'node:stream'
import { afterAll, describe, expect, it } from 'vitest'
import { readiness } from '#/app.ts'
import { pool } from '#/kernel/db/client.ts'
import { app } from '#/test/http.ts'
import { createLogger } from './log.ts'

afterAll(() => pool.end())

function capture() {
	const lines: string[] = []
	const stream = new Writable({
		write(chunk, _enc, cb) {
			lines.push(String(chunk))
			cb()
		},
	})
	return { logger: createLogger(stream), lines }
}

describe('логи', () => {
	it('ПДн и секреты не попадают в лог (скилл personal-data)', () => {
		const { logger, lines } = capture()
		logger.info(
			{
				user: { email: 'anna@example.com', name: 'Анна Иванова' },
				password: 'p@ss',
				headers: { cookie: 'sid=1' },
				token: 't',
				schoolId: 'school-1',
			},
			'probe',
		)
		const out = lines.join('')
		for (const secret of ['anna@example.com', 'Анна Иванова', 'p@ss', 'sid=1']) expect(out).not.toContain(secret)
		expect(out).toContain('[скрыто]')
		expect(out).toContain('school-1') // идентификаторы — можно
	})
})

describe('requestId', () => {
	it('у каждого ответа есть x-request-id; корректный входящий сохраняется, мусорный заменяется', async () => {
		const own = await app.request('/health/live')
		expect(own.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
		const passed = await app.request('/health/live', { headers: { 'x-request-id': 'proxy-req-12345' } })
		expect(passed.headers.get('x-request-id')).toBe('proxy-req-12345')
		const junk = await app.request('/health/live', { headers: { 'x-request-id': '<script>' } })
		expect(junk.headers.get('x-request-id')).not.toBe('<script>')
	})
})

describe('health', () => {
	it('/health/ready — 200, когда БД доступна', async () => {
		const res = await app.request('/health/ready')
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: 'ok', checks: { db: 'ok' } })
	})

	it('недоступная зависимость — не готов', async () => {
		const r = await readiness({ db: async () => 1, s3: async () => Promise.reject(new Error('down')) })
		expect(r).toEqual({ ok: false, checks: { db: 'ok', s3: 'fail' } })
	})
})
