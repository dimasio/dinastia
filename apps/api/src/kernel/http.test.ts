// ctx.http (скилл integrations): приватные сети закрыты (литералом, через DNS, редиректом), таймаут, повторы только
// идемпотентных запросов, в лог — без тел.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttp, isBlockedAddress } from './http.ts'
import { createLogger } from './log.ts'

let server: Server
let base: string
const hits = new Map<string, number>()
const seenHeaders: Record<string, string | undefined> = {}

beforeAll(async () => {
	server = createServer((req, res) => {
		const path = req.url ?? '/'
		const n = (hits.get(path) ?? 0) + 1
		hits.set(path, n)
		seenHeaders[path] = req.headers['idempotency-key'] as string | undefined
		if (path === '/ok') return res.end(JSON.stringify({ secret: 'тело-не-в-лог' }))
		if (path.startsWith('/flaky')) {
			res.statusCode = n === 1 ? 503 : 200
			return res.end(String(n))
		}
		if (path === '/to-metadata') {
			res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
			return res.end()
		}
		if (path === '/to-private') {
			res.writeHead(301, { location: 'http://10.0.0.1/' })
			return res.end()
		}
		if (path === '/loop') {
			res.writeHead(302, { location: '/loop' })
			return res.end()
		}
		if (path === '/hang') return // не отвечаем
		res.statusCode = 404
		res.end()
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
	server.closeAllConnections()
	server.close()
})

function capture() {
	const lines: string[] = []
	const stream = new Writable({
		write(chunk, _e, cb) {
			lines.push(String(chunk))
			cb()
		},
	})
	return { log: createLogger(stream), lines }
}

/** Клиент, которому можно к локальному серверу теста — и только к нему. */
const local = (log = capture().log) => createHttp({ log, allowAddresses: ['127.0.0.1'], backoffMs: () => 1 })
const code = (p: Promise<unknown>) =>
	p.then(
		() => 'ok',
		(e: { code?: string }) => e.code,
	)

describe('запрещённые адреса', () => {
	it.each([
		['127.0.0.1', true],
		['10.1.2.3', true],
		['172.20.0.1', true],
		['192.168.1.1', true],
		['169.254.169.254', true],
		['100.64.0.1', true],
		['0.0.0.0', true],
		['::1', true],
		['fd00::1', true],
		['fe80::1', true],
		['::ffff:127.0.0.1', true],
		['::ffff:10.0.0.1', true],
		['not-an-ip', true],
		['8.8.8.8', false],
		['77.88.8.8', false],
		['2a00:1450:4010::1', false],
	])('%s → запрещён: %s', (ip, blocked) => {
		expect(isBlockedAddress(ip)).toBe(blocked)
	})
})

describe('ctx.http', () => {
	const http = createHttp({ log: capture().log })

	it('IP-литерал, имя с приватным адресом и не-http — отказ до соединения', async () => {
		expect(await code(http.request('http://169.254.169.254/latest/meta-data/'))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(http.request(`${base}/ok`))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(http.request('http://[::1]/'))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(http.request('http://localhost/'))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(http.request('file:///etc/passwd'))).toBe('HTTP_BAD_URL')
		expect(await code(http.request('не адрес'))).toBe('HTTP_BAD_URL')
	})

	it('ответ разрешённого адреса; в логе метод, хост, статус — без тела', async () => {
		const { log, lines } = capture()
		const res = await local(log).request(`${base}/ok`)
		expect(res.status).toBe(200)
		expect(res.json()).toEqual({ secret: 'тело-не-в-лог' })
		const entry = JSON.parse(lines.at(-1) ?? '{}')
		expect(entry).toMatchObject({ method: 'GET', status: 200, msg: 'http request' })
		expect(lines.join('')).not.toContain('тело-не-в-лог')
	})

	it('редирект на приватный адрес — отказ; бесконечный редирект — ошибка', async () => {
		expect(await code(local().request(`${base}/to-metadata`))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(local().request(`${base}/to-private`))).toBe('HTTP_BLOCKED_ADDRESS')
		expect(await code(local().request(`${base}/loop`))).toBe('HTTP_TOO_MANY_REDIRECTS')
	})

	it('5xx: GET повторяется; POST без ключа — нет; POST с ключом идемпотентности — да, ключ в заголовке', async () => {
		expect((await local().request(`${base}/flaky-get`)).status).toBe(200)
		expect(hits.get('/flaky-get')).toBe(2)

		expect((await local().request(`${base}/flaky-post`, { method: 'POST', body: '{}' })).status).toBe(503)
		expect(hits.get('/flaky-post')).toBe(1)

		const res = await local().request(`${base}/flaky-key`, { method: 'POST', body: '{}', idempotencyKey: 'pay-1' })
		expect(res.status).toBe(200)
		expect(hits.get('/flaky-key')).toBe(2)
		expect(seenHeaders['/flaky-key']).toBe('pay-1')
	})

	it('таймаут', async () => {
		expect(await code(local().request(`${base}/hang`, { timeoutMs: 200, retries: 0 }))).toBe('HTTP_TIMEOUT')
	})
})
