import { opaqueJson, tenantTable } from '@dinastia/db'
import { pgEnum, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const webhookEventStatus = pgEnum('webhook_event_status', ['received', 'processed', 'ignored'])

/**
 * Входящее событие провайдера (скилл integrations): записывается до обработки — повтор доставки с тем же
 * `external_id` не создаёт второй строки и второй обработки. Обрабатывает задача webhooks.process.
 */
export const webhookEvents = tenantTable(
	'webhook_events',
	{
		/** Ключ провайдера = сегмент пути `/api/webhooks/<provider>/<schoolId>`. */
		provider: text('provider').notNull(),
		/** Id события у провайдера — ключ идемпотентности. */
		externalId: text('external_id').notNull(),
		/** Тип события провайдера (`payment.succeeded`, `video.ready`) — по нему выбирается обработчик. */
		type: text('type').notNull(),
		/** Данные события как прислал провайдер (D-032: непрозрачные; схему проверяет обработчик). */
		payload: opaqueJson('payload').notNull(),
		status: webhookEventStatus('status').notNull().default('received'),
		processedAt: timestamp('processed_at', { withTimezone: true }),
	},
	(t) => [uniqueIndex().on(t.schoolId, t.provider, t.externalId)],
)
