// Вебхуки (скилл integrations): провайдер (ядро) проверяет подпись и достаёт событие, обработчик (модуль) делает
// дело в транзакции школы. Маршрут и идемпотентность — ядро (receive.ts).
import type { z } from 'zod'
import type { BaseCtx } from '../context.ts'

/** Входящий запрос вебхука: тело — строкой, как пришло (подпись считается по байтам тела). */
export interface WebhookRequest {
	headers: Headers
	body: string
	schoolId: string
}

/** Событие провайдера после проверки подписи. */
export interface WebhookEvent {
	externalId: string
	type: string
	payload: unknown
}

export interface WebhookProvider {
	/** Сегмент пути: `/api/webhooks/<key>/<schoolId>`. */
	key: string
	/** Подпись запроса верна (секрет провайдера или ключ школы). Сравнение — за постоянное время. */
	verify(req: WebhookRequest): boolean | Promise<boolean>
	/** Событие из тела; null — тело не разобрать (ответ 400). */
	parse(req: WebhookRequest): WebhookEvent | null
}

export const PROVIDER_KEY = /^[a-z][a-z0-9-]*$/

export function defineWebhookProvider(def: WebhookProvider): WebhookProvider {
	if (!PROVIDER_KEY.test(def.key)) throw new Error(`провайдер вебхуков «${def.key}»: ключ — kebab-case`)
	return def
}

export interface WebhookHandler<D = unknown> {
	provider: string
	/** Тип события провайдера. */
	type: string
	/** Схема payload — провайдер мог поменять формат; ошибка схемы — без повтора (deadletter). */
	schema: z.ZodType<D>
	/** Транзакция школы события; повтор задачи после сбоя — снова сюда, отметка processed — в той же транзакции. */
	handle: (ctx: BaseCtx, data: D, event: { externalId: string }) => unknown
}

// biome-ignore lint/suspicious/noExplicitAny: у каждого обработчика своя схема данных
export type AnyWebhookHandler = WebhookHandler<any>

export const defineWebhookHandler = <D>(def: WebhookHandler<D>): WebhookHandler<D> => def
