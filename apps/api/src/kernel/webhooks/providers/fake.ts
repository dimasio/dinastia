// Фейковый провайдер (скилл integrations: фейк обязателен) — для тестов и локальной разработки, вне production.
// Подпись: `x-fake-signature: sha256=<hex HMAC-SHA256(секрет, тело)>`; тело — `{ id, type, data }`.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { config } from '../../config.ts'
import { defineWebhookProvider } from '../define.ts'

export const fakeSignature = (body: string, secret = config.WEBHOOK_FAKE_SECRET) =>
	`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const Body = z.object({ id: z.string().min(1).max(200), type: z.string().min(1).max(100), data: z.unknown() })

export const fakeProvider = defineWebhookProvider({
	key: 'fake',
	verify({ headers, body }) {
		const got = Buffer.from(headers.get('x-fake-signature') ?? '')
		const want = Buffer.from(fakeSignature(body))
		return got.length === want.length && timingSafeEqual(got, want)
	},
	parse({ body }) {
		try {
			const b = Body.parse(JSON.parse(body))
			return { externalId: b.id, type: b.type, payload: b.data ?? null }
		} catch {
			return null
		}
	},
})
