---
name: background-jobs
description: Фоновые и периодические задачи Dinastia на pg-boss — defineJob в modules/<m>/jobs.ts (имя <модуль>.<действие>, zod-схема данных, handler с тенантным контекстом, retry, timeout, singleton/дедупликация, schedule cron, scope all-schools через forEachSchool), постановка ctx.jobs.send в транзакции, отложенный запуск, идемпотентность, воркер pnpm dev, просмотр и отладка. Использовать для «по расписанию», «раз в час», «в фоне», «рассылка», «пересчитать», «напоминание» — аналог шаблонов задач GaskarFM.
---

# Фоновые задачи

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.6).

Очередь — pg-boss в той же Postgres (D-008). Воркер — отдельный процесс `apps/api` (`pnpm dev` запускает его);
в проде масштабируется отдельно от API.

## Задача

```ts
// apps/api/src/modules/learning/jobs.ts
import { z } from 'zod'
import { defineJob } from '@/kernel/jobs'
import { recalcProgress } from './progress.service'
import { expireDue } from './enrollment.service'

export const recalcProgressJob = defineJob({
  name: 'learning.recalc-progress',
  schema: z.object({ enrollmentId: z.string().uuid() }),
  singletonKey: (d) => d.enrollmentId,          // не ставить дубль, пока предыдущая в очереди
  retry: { limit: 5, backoff: true },
  handler: (ctx, d) => recalcProgress(ctx, d.enrollmentId),   // ctx — тенантный, как в процедуре
})

export const expireEnrollmentsJob = defineJob({
  name: 'learning.expire-enrollments',
  schema: z.object({}),
  schedule: '*/15 * * * *',                     // cron, Europe/Moscow
  scope: 'all-schools',                         // ядро вызывает handler в forEachSchool, транзакция на школу
  timeout: '10m',
  handler: (ctx) => expireDue(ctx),
})

export const jobs = [recalcProgressJob, expireEnrollmentsJob]
```

Постановка:

```ts
await ctx.jobs.send(recalcProgressJob, { enrollmentId })              // в транзакции запроса
await ctx.jobs.send(deadlineReminderJob, { deadlineId }, { startAfter: dueAt })  // отложенно
```

`schoolId` добавляется к данным автоматически; в `handler` контекст уже тенантный.

## Правила

- **Идемпотентность**: задача может выполниться повторно (retry, рестарт) — повтор не должен удваивать эффект
  (проверяй состояние, используй `singletonKey`, уникальные индексы, «если уже отправлено — выйти»).
- Данные задачи — **идентификаторы**, не объекты целиком (объект перечитывается в handler).
- Длинная работа по многим записям — батчами по 500 с отдельной задачей на батч или курсор; одна задача ≤ `timeout`.
- Внешние вызовы (почта, видео) — только в задачах, не в запросе пользователя.
- Ошибка бизнес-правила, которую повтор не исправит, — `fail.*` → задача помечается `failed` без retry
  (`permanent: true` у ошибки); сетевые ошибки — retry.
- Тестовое время: `ctx.now()`.

## Отладка

- `pnpm jobs:list` — очереди и счётчики; `pnpm jobs:run <name> --school <slug> --data '{…}'` — выполнить
  немедленно локально.
- Логи задачи — с `job`, `jobId`, `schoolId`.

## Готово, когда

Есть тест handler на реальной БД (вызов напрямую с тестовым ctx), повторный запуск не меняет результат,
`pnpm check` зелёный (`check:registries`: уникальное имя, валидный cron).

## Остановись и спроси, если

- задача должна идти чаще раза в минуту или обрабатывать > 100 тыс. записей за запуск;
- нужна гарантированная доставка во внешнюю систему с подтверждением (вебхуки — R3).
