---
name: observability
description: Наблюдаемость Dinastia — структурные логи pino (ctx.log с requestId, schoolId, memberId, job), уровни и что логировать (без ПДн и секретов), сбор ошибок в GlitchTip (Sentry SDK) с контекстом школы, метрики (длительность процедур, ошибки, очереди pg-boss, бизнес-метрики), health-checks /health/live и /health/ready, алерты, продуктовая аналитика событий (без сторонних трекеров с ПДн). Использовать для «добавь логирование», «почему упало в проде», «метрики», «мониторинг», «алерт», «аналитика использования».
---

# Наблюдаемость

> Статус: сверено с кодом в 5.4 (логи, ошибки, метрики, health, правила оповещений). Сам GlitchTip, Prometheus и доставка
> оповещений — на стенде (5.3).

## Логи

```ts
ctx.log.info({ courseId, lessons: n }, 'course published')       // в сервисе — из SchoolCtx
ctx.log.warn({ attemptId }, 'attempt expired on submit')
ctx.log.error({ err, provider: 'kinescope' }, 'video status failed')
```

Как устроено (`apps/api/src/kernel/log.ts`, `apps/api/src/app.ts`):
- pino; в dev — pino-pretty, в проде — JSON; в тестах — `silent` (кроме `createLogger(stream)`).
- Каждый запрос получает `requestId` (свой или из `x-request-id` прокси, если похож на id) и отвечает тем же
  заголовком `x-request-id` — по нему запрос ищется в логах (скилл `debugging`).
- Цепочка процедуры добавляет к логгеру `userId`, `schoolId`, `memberId`, `role`; итоговая строка запроса
  (`msg: "request"`: метод, путь, статус, `ms`) содержит их же. 5xx — `error`, 4xx — `warn`.
- Неожиданное исключение в процедуре (не бизнес-ошибка, не валидация, не права) — `error` с `procedure` и стеком
  (`errorsMw` в `kernel/orpc.ts`); клиент получает 500 без подробностей.
- **Маскирование** (`REDACT_PATHS`): ключи `password`, `token`, `secret`, `email`, `phone`, `name`, `cookie`,
  `authorization`, `set-cookie`, `ip` на глубине до 2 → `[скрыто]`. Тест — `kernel/log.test.ts`. Не полагайся на него:
  не клади ПДн в поля лога вообще; идентификаторы (`userId`, `schoolId`) — можно.

Правила:
- Структура: объект полей + короткое сообщение на английском (строки логов — не UI).
- Уровни: `error` — нужна реакция человека; `warn` — неожиданно, но обработано; `info` — значимые бизнес-факты;
  `debug` — только локально (`LOG_LEVEL=debug`).
- Не логируй в цикле по записям — агрегируй.

## Ошибки

- `kernel/error-report.ts`: `initErrorReporting('api' | 'worker')` в `main.ts`/`worker.ts`; без `SENTRY_DSN` — выключено (локально и в
  тестах). GlitchTip — **свой экземпляр в РФ** (152-ФЗ), Sentry SDK `@sentry/node` без трассировки и автоинструментации.
- Неожиданное исключение процедуры (`errorsMw` в `kernel/orpc.ts`) и задачи, которую стоит повторить (`settle` в
  `worker-runtime.ts`), — `reportError(error, { procedure | job, schoolId, requestId })`. `fail.*`, валидация, права, битые данные
  задачи — **не отправляются**.
- `beforeSend` (`scrub`) вырезает запрос (тело, заголовки, cookie), пользователя, IP, историю действий — остаются стек, теги, релиз
  (`APP_RELEASE`). Тест — `kernel/observability.test.ts` (транспорт в памяти).
- Веб: `apps/web/src/app/error-report.ts` — `@sentry/react` лениво (вне начальной загрузки), при `SENTRY_DSN_WEB` на сборке; граница
  ошибок маршрутов (`__root.tsx`) отправляет неожиданные; адрес страницы не уходит (в нём токены). Origin GlitchTip — в CSP
  `connect-src` (`apps/web/csp.ts`). Source maps — при деплое (фаза 6).

## Метрики

Свой экспортёр `kernel/metrics.ts` (`counter`, `gauge`, `histogram`, текст Prometheus; `prom-client` не выпускался с 2024-06) — на
внутреннем порту `METRICS_PORT` (`serveMetrics`, один сервер на процесс; 0 — выключено), наружу не публикуется:
- `rpc_duration_seconds{procedure,status}` (`ok` | `client_error` | `error`), `rpc_errors_total{procedure,code}` — в `errorsMw`;
- `jobs_duration_seconds{job,status}`, `jobs_failed_total{job,retry}` — в `settle`;
- при чтении (`kernel/metrics-collectors.ts`): `jobs_queue_size{job}`, `jobs_lag_seconds{job}` (старейшая готовая задача),
  `db_pool_connections{state}`;
- бизнес: `enrollments_created_total{outcome,source}` (`learning/enrollment.service.ts`). Метки — без `schoolId` и id записей
  (кардинальность). Новая метрика — `counter(...)` в модуле, имя уникально (повтор — ошибка при старте).

## Health

- `/health/live` — процесс жив (без зависимостей).
- `/health/ready` — зависимости: `db` и `s3` (`HeadBucket`, 5.4). 503 + `{ status: 'fail', checks: { db: 'fail', s3: 'ok' } }`, если
  хоть одна недоступна. Новая зависимость — проверка в `readiness()` (`apps/api/src/app.ts`) + тест.
- Запросы к `/health/*` не пишутся в лог запросов (шум от оркестратора).

## Алерты

Правила Prometheus — `docker/monitoring/alerts.yml` (5.4); подключаются на стенде, доставка — Alertmanager → Telegram (5.3).

| Алерт               | Порог                                                      |
| ------------------- | ---------------------------------------------------------- |
| 5xx API             | > 1 % за 5 мин                                             |
| p95 процедуры       | > 1 с 10 мин                                               |
| задачи `failed`     | рост > 10 за 15 мин или любая в `certificates.*`, `mail.*` |
| jobs lag            | > 2 мин                                                    |
| диск/подключения БД | > 80 %                                                     |

## Продуктовая аналитика

Какие функции используют школы — из доменных событий (`events-automations`) и таблиц, агрегатами внутри
Dinastia. Сторонние трекеры (Яндекс Метрика) — только на публичном сайте школы с согласия; в кабинетах — нет.

## Остановись и спроси, если

- нужен новый внешний сервис мониторинга;
- нужна аналитика по конкретным ученикам (это ПДн — `personal-data`).
