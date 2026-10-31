---
name: integrations
description: Интеграции Dinastia с внешними сервисами — паттерн провайдера (интерфейс в ядре, реализация kinescope/yookassa/unisender, фейк для тестов и локальной разработки, выбор через config), исходящие вызовы через ctx.http (таймауты, ретраи, идемпотентные ключи, без приватных IP), только в фоновых задачах; входящие вебхуки (подпись, повтор, идемпотентность по id события, быстрый 200 и обработка задачей), хранение ключей школы (зашифрованные настройки), OAuth-подключения, ограничения 152-ФЗ. Использовать для «интеграция с …», «подключить сервис», «вебхук», «платёжка», «Telegram-бот», «Kinescope», «почтовый провайдер».
---

# Интеграции

> Статус: `ctx.http` и вебхуки сверены с кодом в 1.11; провайдеры видео — с блоком video, платёжки — R2,
> мессенджеры — R3.

## Провайдер

Каждый внешний сервис — за **интерфейсом** ядра; модули не знают, какой сервис подключён.

```ts
// apps/api/src/kernel/video/provider.ts
export interface VideoProvider {
	createUpload(input: { title: string; schoolId: string }): Promise<{ videoId: string; uploadUrl: string }>
	getStatus(videoId: string): Promise<'processing' | 'ready' | 'failed'>
	playerToken(videoId: string, viewer: { memberId: string }): Promise<{ token: string; expiresAt: Date }>
	parseWebhook(req: WebhookRequest): Promise<VideoEvent | null> // проверяет подпись
}
// реализации: kernel/video/kinescope.ts, kernel/video/fake.ts
// выбор: config.VIDEO_PROVIDER = 'kinescope' | 'fake'
```

Правила:
- **Фейк обязателен**: локально и в тестах работает без интернета и ключей (`fake` — по умолчанию в `.env.example`).
- Ошибки провайдера переводятся в свои (`ProviderError` с `retryable`).
- Схема ответов внешнего API — zod-парсинг (сервис может поменять формат).

## Исходящие вызовы

`ctx.http` (ядро, `kernel/http.ts`) — единственный путь наружу:

```ts
// пример будущего провайдера видео (ProviderError и KINESCOPE_TOKEN появятся вместе с ним)
const res = await ctx.http.request('https://api.kinescope.io/v1/videos', {
	method: 'POST',
	headers: { authorization: `Bearer ${config.KINESCOPE_TOKEN}`, 'content-type': 'application/json' },
	body: JSON.stringify({ title }),
	idempotencyKey: `video:${lessonBlockId}`, // заголовок Idempotency-Key; без него POST не повторяется
	timeoutMs: 5_000, // по умолчанию 10 с на весь запрос с редиректами
})
if (res.status !== 200) throw new ProviderError('kinescope', res.status >= 500)
const video = VideoResponse.parse(res.json()) // ответ провайдера — через zod
```

- **Приватные сети закрыты**: loopback, 10/8, 172.16/12, 192.168/16, 169.254/16 (метаданные облака), CGNAT, IPv6
  ULA/link-local, IPv4-mapped. Адрес проверяется в момент соединения (свой `lookup`) — DNS rebinding не проходит;
  редиректы (до 3) — так же. Нарушение — `HttpError` с кодом `HTTP_BLOCKED_ADDRESS`; другие коды —
  `HTTP_BAD_URL` (не http/https), `HTTP_TIMEOUT`, `HTTP_TOO_MANY_REDIRECTS`, `HTTP_NETWORK` (`retryable`).
- **Повторы** (по умолчанию 2, `retries`): сеть, 5xx, 429 (с `Retry-After`) — только для GET/HEAD/PUT/DELETE или
  запроса с `idempotencyKey`. Остальной ответ возвращается как есть: статус проверяет вызывающий.
- **Лог** — метод, хост, статус, время, номер попытки; тела и заголовки не пишутся. Ответ — до 10 МБ.
- Только в **фоновой задаче** (скилл `background-jobs`), не в запросе пользователя. Исключение — синхронно нужный
  результат (`createUpload`), с таймаутом ≤ 5 с.
- Мутации у провайдера — с **идемпотентным ключом** (платёж, письмо): повтор задачи не создаёт дубль.
- Тест с локальным сервером: `createHttp({ log, allowAddresses: ['127.0.0.1'] })` — разрешение только в тесте.

## Входящие вебхуки

```
POST /api/webhooks/<provider>/<schoolId>                 (kernel/webhooks/receive.ts, маршрут — app.ts)
  → провайдер и активная школа                           нет — 404
  → тело > 1 МБ                                          413
  → provider.verify (подпись по байтам тела)             неверная — 401, лог
  → provider.parse → { externalId, type, payload }       не разобрать — 400
  → webhook_events (school_id + provider + external_id уникальны)   дубль — 200 { duplicate: true }
  → задача webhooks.process в той же транзакции, 200 { duplicate: false }
задача: обработчик модуля по (provider, type) → handle(ctx школы, данные по схеме) → status processed
        в одной транзакции (сбой — повтор, после успеха — ничего); нет обработчика — ignored
```

Провайдер — ядро (`kernel/webhooks/providers/<key>.ts`, `defineWebhookProvider`, список — `webhookProviders` в
`receive.ts`); фейк `fake` (HMAC-SHA256 тела в `x-fake-signature: sha256=…`, секрет `WEBHOOK_FAKE_SECRET`) — только
вне production. Обработчик — модуль:

```ts
// modules/<m>/webhooks.ts
export const videoReady = defineWebhookHandler({
	provider: 'kinescope',
	type: 'video.ready',
	schema: z.object({ videoId: z.string() }), // ошибка схемы — без повтора (deadletter)
	async handle(ctx, data, event) {
		await markVideoReady(ctx, data.videoId) // идемпотентно: повтор задачи после сбоя придёт сюда снова
	},
})
// modules/<m>/index.ts: defineModule({ …, webhooks: [videoReady] })
```

Тест — `kernel/webhooks/webhooks.test.ts` (подписать тело `fakeSignature(body)`, `drainJobs()`).

## Ключи школы

Когда школа подключает **свой** аккаунт (свой магазин ЮKassa, свой Telegram-бот): ключи — в настройке школы с
`secret: true` (шифруются ядром, не возвращаются на клиент, показывается только «подключено · …1234»); проверка ключа
при сохранении тестовым вызовом.

## Новая интеграция — шаги

1. Обоснование и выбор сервиса (стоимость, РФ, 152-ФЗ: какие ПДн уходят) — с человеком; `D-NNN`.
2. Интерфейс провайдера (если вида ещё нет — ядро) + фейк + реальная реализация.
3. Исходящие вызовы в задачах, вебхуки — по схеме выше.
4. Тесты на фейке; контрактный тест реальной реализации на записанных ответах (fixtures), без сети в CI.
5. Конфиг в `kernel/config.ts` и `.env.example`; инструкция подключения — в `docs/guide/` (раздел появится с первой интеграцией).

## Остановись и спроси, если

- сервис иностранный или принимает ПДн учеников;
- нужны деньги (платёжки, чеки 54-ФЗ) — R2, спроектировать через `feature-design`;
- у сервиса нет подписи вебхуков.
