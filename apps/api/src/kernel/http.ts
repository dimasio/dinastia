// Исходящие HTTP-запросы (скиллы integrations, security-baseline): только через ctx.http. Адрес проверяется в момент
// соединения (lookup сокета) — приватные и служебные сети недоступны даже при DNS rebinding и на редиректах.
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import type { Logger } from './log.ts'

/** Сети, куда запрос из приложения не уходит: loopback, частные, link-local (метаданные облака), CGNAT, мультикаст… */
const blocked = new BlockList()
for (const [net, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
] as const)
	blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
	['::', 128],
	['::1', 128],
	['64:ff9b::', 96],
	['100::', 64],
	['2001:db8::', 32],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8],
] as const)
	blocked.addSubnet(net, prefix, 'ipv6')

/** Адрес из запрещённой сети (IPv4, IPv6, IPv4-mapped IPv6). Не IP — тоже запрещён. */
export function isBlockedAddress(address: string): boolean {
	const family = isIP(address)
	if (family === 4) return blocked.check(address, 'ipv4')
	if (family !== 6) return true
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
	if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4')
	return blocked.check(address, 'ipv6')
}

export class HttpError extends Error {
	constructor(
		readonly code:
			| 'HTTP_BLOCKED_ADDRESS'
			| 'HTTP_BAD_URL'
			| 'HTTP_TIMEOUT'
			| 'HTTP_TOO_MANY_REDIRECTS'
			| 'HTTP_NETWORK',
		message: string,
		/** Можно ли повторить (сеть, таймаут) — скилл integrations, ProviderError.retryable. */
		readonly retryable = false,
	) {
		super(message)
		this.name = 'HttpError'
	}
}

export interface HttpRequest {
	method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	headers?: Record<string, string>
	body?: string | Uint8Array
	/** Таймаут всего запроса с редиректами, мс (по умолчанию 10 000). */
	timeoutMs?: number
	/** Повторов при сети/5xx/429 (по умолчанию 2). Для POST/PATCH — только с `idempotencyKey`. */
	retries?: number
	/** Ключ идемпотентности провайдера — заголовок `Idempotency-Key`; разрешает повторы мутаций. */
	idempotencyKey?: string
}

export interface HttpResponse {
	status: number
	headers: Record<string, string>
	text: () => string
	json: () => unknown
}

export interface Http {
	request(url: string, req?: HttpRequest): Promise<HttpResponse>
}

export interface HttpOptions {
	log: Logger
	/** Только тесты: адреса, к которым можно (локальный сервер теста). */
	allowAddresses?: readonly string[]
	/** Пауза перед повтором, мс (по умолчанию 300 · номер попытки). */
	backoffMs?: (attempt: number) => number
}

const MAX_REDIRECTS = 3
const MAX_BODY = 10 * 1024 * 1024
const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE'])

export function createHttp(opts: HttpOptions): Http {
	const allowed = (address: string) => opts.allowAddresses?.includes(address) || !isBlockedAddress(address)

	const lookup: LookupFunction = (hostname, options, callback) => {
		dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
			if (err) return callback(err, '', 0)
			const bad = addresses.find((a) => !allowed(a.address))
			if (bad || addresses.length === 0) {
				return callback(new HttpError('HTTP_BLOCKED_ADDRESS', `адрес ${hostname} запрещён`), '', 0)
			}
			if (options.all) return callback(null, addresses as never)
			const first = addresses[0] as LookupAddress
			callback(null, first.address, first.family)
		})
	}

	function once(url: URL, req: HttpRequest, signal: AbortSignal) {
		return new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
			const host = url.hostname.replace(/^\[|\]$/g, '')
			if (isIP(host) && !allowed(host)) return reject(new HttpError('HTTP_BLOCKED_ADDRESS', `адрес ${host} запрещён`))
			const headers = { ...req.headers, ...(req.idempotencyKey ? { 'idempotency-key': req.idempotencyKey } : {}) }
			const r = (url.protocol === 'https:' ? https : http).request(
				url,
				{ method: req.method ?? 'GET', headers, lookup, signal, agent: false },
				(res) => {
					const chunks: Buffer[] = []
					let size = 0
					res.on('data', (c: Buffer) => {
						size += c.length
						if (size > MAX_BODY) r.destroy(new HttpError('HTTP_NETWORK', 'ответ больше 10 МБ'))
						else chunks.push(c)
					})
					res.on('end', () => {
						const h: Record<string, string> = {}
						for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h[k] = String(v)
						resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) })
					})
					res.on('error', reject)
				},
			)
			r.on('error', reject)
			if (req.body !== undefined) r.write(req.body)
			r.end()
		})
	}

	async function withRedirects(start: URL, req: HttpRequest, signal: AbortSignal) {
		let url = start
		let current = req
		for (let i = 0; i <= MAX_REDIRECTS; i++) {
			const res = await once(url, current, signal)
			const location = res.headers.location
			if (res.status < 300 || res.status >= 400 || res.status === 304 || !location) return { url, res }
			url = parseUrl(new URL(location, url).toString())
			// 303 и 301/302 после POST — браузерная семантика: дальше GET без тела
			if (res.status === 303 || ((res.status === 301 || res.status === 302) && current.method === 'POST')) {
				const { body: _, ...rest } = current
				current = { ...rest, method: 'GET' }
			}
		}
		throw new HttpError('HTTP_TOO_MANY_REDIRECTS', `больше ${MAX_REDIRECTS} редиректов`)
	}

	return {
		async request(rawUrl, req = {}) {
			const url = parseUrl(rawUrl)
			const method = req.method ?? 'GET'
			const retries = IDEMPOTENT.has(method) || req.idempotencyKey ? (req.retries ?? 2) : 0
			const backoff = opts.backoffMs ?? ((n) => 300 * n)
			const signal = AbortSignal.timeout(req.timeoutMs ?? 10_000)
			for (let attempt = 0; ; attempt++) {
				const started = performance.now()
				const meta = { method, host: url.host, attempt }
				try {
					const { res } = await withRedirects(url, { ...req, method }, signal)
					const ms = Math.round(performance.now() - started)
					const retryable = res.status >= 500 || res.status === 429
					opts.log[res.status >= 500 ? 'warn' : 'info']({ ...meta, status: res.status, ms }, 'http request')
					if (retryable && attempt < retries) {
						await sleep(retryAfterMs(res.headers['retry-after']) ?? backoff(attempt + 1))
						continue
					}
					const text = res.body.toString('utf8')
					return { status: res.status, headers: res.headers, text: () => text, json: () => JSON.parse(text) }
				} catch (error) {
					const e = toHttpError(error, signal)
					opts.log.warn({ ...meta, code: e.code, ms: Math.round(performance.now() - started) }, 'http request failed')
					if (!e.retryable || attempt >= retries) throw e
					await sleep(backoff(attempt + 1))
				}
			}
		},
	}
}

function parseUrl(raw: string): URL {
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new HttpError('HTTP_BAD_URL', 'неверный адрес')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError('HTTP_BAD_URL', 'только http и https')
	return url
}

function toHttpError(error: unknown, signal: AbortSignal): HttpError {
	if (error instanceof HttpError) return error
	if (signal.aborted) return new HttpError('HTTP_TIMEOUT', 'таймаут запроса')
	const cause = (error as { cause?: unknown }).cause
	if (cause instanceof HttpError) return cause
	return new HttpError('HTTP_NETWORK', (error as Error).message, true)
}

function retryAfterMs(header: string | undefined): number | null {
	if (!header) return null
	const s = Number(header)
	return Number.isFinite(s) ? Math.min(s, 30) * 1000 : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
