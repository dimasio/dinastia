import { randomUUID } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './kernel/auth/auth.ts'
import { CLIENT_IP_HEADER, resolveClientIp } from './kernel/client-ip.ts'
import { config } from './kernel/config.ts'
import { db } from './kernel/db/client.ts'
import { type Logger, log } from './kernel/log.ts'
import type { RequestCtx } from './kernel/orpc.ts'
import { checkBucket } from './kernel/storage/s3.ts'
import { MAX_WEBHOOK_BODY, receiveWebhook } from './kernel/webhooks/receive.ts'
import { router } from './router.ts'

/** Предел тела запроса к API, байт. */
export const MAX_API_BODY = 2 * 1024 * 1024

const rpc = new RPCHandler(router)
const rest = new OpenAPIHandler(router)
const openapi = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })

function clientIp(c: Context): string | null {
	let socketIp: string | null = null
	try {
		socketIp = getConnInfo(c).remote.address ?? null
	} catch {}
	return resolveClientIp(c.req.header('x-forwarded-for'), socketIp, config.TRUST_PROXY_HOPS)
}

type Env = { Variables: { requestId: string; log: Logger; tags: Record<string, string> } }

function requestCtx(c: Context<Env>): RequestCtx {
	return {
		headers: c.req.raw.headers,
		ip: clientIp(c),
		now: () => new Date(),
		log: c.var.log,
		requestId: c.var.requestId,
		tags: c.var.tags,
	}
}

/** Готовность к трафику: зависимости, без которых запросы не обслужить — БД и хранилище файлов (5.4). */
export async function readiness(
	checks: Record<string, () => Promise<unknown>> = { db: () => db.execute(sql`select 1`), s3: checkBucket },
) {
	const results = await Promise.all(
		Object.entries(checks).map(async ([name, check]) => {
			try {
				await check()
				return [name, 'ok'] as const
			} catch {
				return [name, 'fail'] as const
			}
		}),
	)
	const status = Object.fromEntries(results)
	return { ok: results.every(([, s]) => s === 'ok'), checks: status }
}

export function createApp() {
	const app = new Hono<Env>()

	// requestId: свой или от прокси (x-request-id); в ответе — тот же, чтобы найти запрос в логах (скилл debugging).
	app.use(async (c, next) => {
		const incoming = c.req.header('x-request-id')
		const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
		const reqLog = log.child({ requestId })
		c.set('requestId', requestId)
		c.set('log', reqLog)
		c.set('tags', {})
		c.header('x-request-id', requestId)
		const started = performance.now()
		await next()
		if (c.req.path.startsWith('/health')) return
		const ms = Math.round(performance.now() - started)
		const level = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info'
		reqLog[level]({ ...c.var.tags, method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'request')
	})

	// заголовки безопасности (5.1, скилл security-baseline): API отдаёт JSON и редиректы — встраивать и исполнять нечего;
	// fetch с сайта школы — тот же сайт (поддомены одного домена). HSTS — только по https.
	app.use(
		secureHeaders({
			contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
			crossOriginResourcePolicy: 'same-site',
			referrerPolicy: 'strict-origin-when-cross-origin',
			strictTransportSecurity: config.APP_PROTOCOL === 'https' ? 'max-age=31536000; includeSubDomains' : false,
		}),
	)

	// предел тела запроса (5.1): файлы идут в S3 напрямую, в API — JSON (rich text до 512 КБ); данные блоков и ответы проверяет
	// сервис — огромное тело не должно дойти до разбора. Вебхуки — свой предел (MAX_WEBHOOK_BODY).
	app.use('/api/*', bodyLimit({ maxSize: MAX_API_BODY, onError: (c) => c.json({ code: 'BODY_TOO_LARGE' }, 413) }))

	app.get('/health/live', (c) => c.json({ status: 'ok' }))
	app.get('/health/ready', async (c) => {
		const { ok, checks } = await readiness()
		return c.json({ status: ok ? 'ok' : 'fail', checks }, ok ? 200 : 503)
	})
	app.on(['GET', 'POST'], '/api/auth/*', (c) => {
		// better-auth берёт IP только из нашего заголовка: значение вычислено с учётом доверенных прокси.
		const headers = new Headers(c.req.raw.headers)
		const ip = clientIp(c)
		if (ip) headers.set(CLIENT_IP_HEADER, ip)
		else headers.delete(CLIENT_IP_HEADER)
		return auth.handler(new Request(c.req.raw, { headers }))
	})

	// Вебхуки провайдеров (скилл integrations): не oRPC — тело нужно байт в байт для проверки подписи.
	app.post('/api/webhooks/:provider/:schoolId', async (c) => {
		if (Number(c.req.header('content-length') ?? 0) > MAX_WEBHOOK_BODY)
			return c.json({ code: 'WEBHOOK_TOO_LARGE' }, 413)
		const result = await receiveWebhook({
			provider: c.req.param('provider'),
			schoolId: c.req.param('schoolId'),
			headers: c.req.raw.headers,
			body: await c.req.text(),
			log: c.var.log,
		})
		return result.status === 200
			? c.json({ ok: true, duplicate: result.duplicate })
			: c.json({ code: result.code }, result.status)
	})

	app.get('/api/openapi.json', async (c) =>
		c.json(
			await openapi.generate(router, {
				info: { title: 'Dinastia API', version: '0.1.0' },
				servers: [{ url: '/api/v1' }],
			}),
		),
	)
	app.use('/api/rpc/*', async (c, next) => {
		const { matched, response } = await rpc.handle(c.req.raw, { prefix: '/api/rpc', context: requestCtx(c) })
		return matched ? c.newResponse(response.body, response) : next()
	})
	app.use('/api/v1/*', async (c, next) => {
		const { matched, response } = await rest.handle(c.req.raw, { prefix: '/api/v1', context: requestCtx(c) })
		return matched ? c.newResponse(response.body, response) : next()
	})

	return app
}
