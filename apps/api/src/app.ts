import { Hono } from 'hono'
import { auth } from './kernel/auth/auth.ts'

export function createApp() {
	const app = new Hono()

	app.get('/health/live', (c) => c.json({ status: 'ok' }))
	app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

	return app
}
