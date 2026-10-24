import { getConnInfo } from '@hono/node-server/conninfo'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { type Context, Hono } from 'hono'
import { auth } from './kernel/auth/auth.ts'
import type { RequestCtx } from './kernel/orpc.ts'
import { router } from './router.ts'

const rpc = new RPCHandler(router)
const rest = new OpenAPIHandler(router)
const openapi = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })

function clientIp(c: Context): string | null {
	// За прокси (прод) — первый адрес X-Forwarded-For; доверие к прокси настраивается в фазе 5.
	const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
	if (forwarded) return forwarded
	try {
		return getConnInfo(c).remote.address ?? null
	} catch {
		return null
	}
}

function requestCtx(c: Context): RequestCtx {
	return { headers: c.req.raw.headers, ip: clientIp(c), now: () => new Date() }
}

export function createApp() {
	const app = new Hono()

	app.get('/health/live', (c) => c.json({ status: 'ok' }))
	app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

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
