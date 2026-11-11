import { describe, expect, it } from 'vitest'
import { createApp, MAX_API_BODY } from './app.ts'

describe('app', () => {
	it('тело запроса к API больше предела — 413 до разбора (5.1)', async () => {
		const res = await createApp().request('/api/rpc/schools/current', {
			method: 'POST',
			headers: { 'content-type': 'application/json', host: 'demo.dinastia.localhost:5173' },
			body: JSON.stringify({ json: 'x'.repeat(MAX_API_BODY + 1) }),
		})
		expect(res.status).toBe(413)
		expect(await res.json()).toEqual({ code: 'BODY_TOO_LARGE' })
	})

	it('заголовки безопасности (5.1): нельзя встроить, не угадывается тип, без лишнего Referer', async () => {
		const res = await createApp().request('/health/live')
		expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
		expect(res.headers.get('x-content-type-options')).toBe('nosniff')
		expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
		expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
	})

	it('отвечает на /health/live', async () => {
		const res = await createApp().request('/health/live')
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: 'ok' })
	})
})
