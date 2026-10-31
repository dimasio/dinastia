// Приём вебхука (скилл integrations): провайдер → школа → подпись → запись события (дубль — 200 и выход) → задача
// обработки в той же транзакции. Ответ быстрый: дело делает задача webhooks.process.
import { schools } from '@dinastia/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { config } from '../config.ts'
import { db } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { defineJob, jobsFor } from '../jobs.ts'
import type { Logger } from '../log.ts'
import { webhookHandler } from '../registry.ts'
import type { WebhookProvider } from './define.ts'
import { fakeProvider } from './providers/fake.ts'
import { webhookEvents } from './schema.ts'

/** Провайдеры вебхуков ядра; фейк — только вне production. */
export const webhookProviders: ReadonlyMap<string, WebhookProvider> = new Map(
	(config.NODE_ENV === 'production' ? [] : [fakeProvider]).map((p) => [p.key, p]),
)

export const MAX_WEBHOOK_BODY = 1024 * 1024

export type ReceiveResult = { status: 200; duplicate: boolean } | { status: 400 | 401 | 404 | 413; code: string }

export async function receiveWebhook(input: {
	provider: string
	schoolId: string
	headers: Headers
	body: string
	log: Logger
}): Promise<ReceiveResult> {
	const provider = webhookProviders.get(input.provider)
	if (!provider) return { status: 404, code: 'WEBHOOK_PROVIDER_UNKNOWN' }
	if (!z.uuid().safeParse(input.schoolId).success) return { status: 404, code: 'SCHOOL_NOT_FOUND' }
	const [school] = await db
		.select({ id: schools.id })
		.from(schools)
		.where(and(eq(schools.id, input.schoolId), eq(schools.status, 'active')))
		.limit(1)
	if (!school) return { status: 404, code: 'SCHOOL_NOT_FOUND' }
	if (Buffer.byteLength(input.body) > MAX_WEBHOOK_BODY) return { status: 413, code: 'WEBHOOK_TOO_LARGE' }

	const req = { headers: input.headers, body: input.body, schoolId: school.id }
	const log = input.log.child({ provider: provider.key, schoolId: school.id })
	if (!(await provider.verify(req))) {
		log.warn('webhook signature invalid')
		return { status: 401, code: 'WEBHOOK_SIGNATURE_INVALID' }
	}
	const event = provider.parse(req)
	if (!event) return { status: 400, code: 'WEBHOOK_BODY_INVALID' }

	return withTenant(school.id, async (tx) => {
		const [row] = await tx
			.insert(webhookEvents)
			.values({ provider: provider.key, externalId: event.externalId, type: event.type, payload: event.payload })
			.onConflictDoNothing()
			.returning({ id: webhookEvents.id })
		if (!row) {
			log.info({ type: event.type }, 'webhook duplicate')
			return { status: 200, duplicate: true } as const
		}
		await jobsFor(tx, school.id).send(processWebhookJob, { eventId: row.id })
		log.info({ type: event.type, eventId: row.id }, 'webhook received')
		return { status: 200, duplicate: false } as const
	})
}

/**
 * Обработка события: обработчик модуля и отметка processed — в одной транзакции школы; повтор после сбоя видит
 * received и обрабатывает снова, после успеха — ничего не делает. Нет обработчика — ignored.
 */
export const processWebhookJob = defineJob({
	name: 'webhooks.process',
	schema: z.object({ eventId: z.uuid() }),
	async handler(ctx, { eventId }) {
		const [event] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).for('update')
		if (event?.status !== 'received') return
		const handler = webhookHandler(event.provider, event.type)
		if (handler) await handler.handle(ctx, handler.schema.parse(event.payload), { externalId: event.externalId })
		else ctx.log.info({ provider: event.provider, type: event.type }, 'webhook has no handler, ignored')
		await ctx.db
			.update(webhookEvents)
			.set({ status: handler ? 'processed' : 'ignored', processedAt: ctx.now() })
			.where(eq(webhookEvents.id, eventId))
	},
})
