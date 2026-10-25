---
name: observability
description: Наблюдаемость Dinastia — структурные логи pino (ctx.log с requestId, schoolId, memberId, job), уровни и что логировать (без ПДн и секретов), сбор ошибок в GlitchTip (Sentry SDK) с контекстом школы, метрики (длительность процедур, ошибки, очереди pg-boss, бизнес-метрики), health-checks /health/live и /health/ready, алерты, продуктовая аналитика событий (без сторонних трекеров с ПДн). Использовать для «добавь логирование», «почему упало в проде», «метрики», «мониторинг», «алерт», «аналитика использования».
---

# Наблюдаемость

> Статус: логи, requestId, health — сверено с кодом в фазе 0 (пункт 0.9); ошибки (GlitchTip), метрики, алерты — фаза 5.

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

- Необработанные исключения API и задач уходят в GlitchTip (Sentry SDK) с тегами `schoolId`, `route|job`, релиз.
- `fail.*` (ожидаемые бизнес-ошибки) — не отправляются как ошибки, только счётчик.
- Клиент — Sentry SDK для React с `beforeSend`, вырезающим ПДн; source maps загружаются при деплое.

## Метрики

Ядро экспортирует Prometheus-метрики `/metrics` (закрыт снаружи):
- `rpc_duration_seconds{procedure,status}`, `rpc_errors_total{procedure,code}`;
- `jobs_queue_size{name}`, `jobs_failed_total{name}`, `jobs_duration_seconds{name}`;
- `db_pool_in_use`, `jobs_lag_seconds` (старейшая готовая задача pg-boss);
- бизнес: `enrollments_created_total`, `submissions_pending` (счётчики без ПДн, без `schoolId` в метках —
  высокая кардинальность).

## Health

- `/health/live` — процесс жив (без зависимостей).
- `/health/ready` — зависимости: сейчас `db`; S3 — с пункта 1.7. 503 + `{ status: 'fail', checks: { db: 'fail' } }`, если
  хоть одна недоступна. Новая зависимость — проверка в `readiness()` (`apps/api/src/app.ts`) + тест.
- Запросы к `/health/*` не пишутся в лог запросов (шум от оркестратора).

## Алерты (фаза 5)

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
