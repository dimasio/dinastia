import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'

describe('app', () => {
	it('отвечает на /health/live', async () => {
		const res = await createApp().request('/health/live')
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: 'ok' })
	})
})
