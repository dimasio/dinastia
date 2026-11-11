---
name: background-jobs
description: Фоновые и периодические задачи Dinastia на pg-boss 12 — defineJob в modules/<m>/jobs.ts (имя <модуль>.<действие>, zod-схема данных, handler(ctx, data) с BaseCtx в транзакции школы, retry, timeoutSeconds, singletonKey, schedule cron по Москве для scope all-schools через forEachSchool), регистрация в defineModule({ jobs }), постановка ctx.jobs.send в транзакции запроса (откат — задачи нет), отложенный запуск startAfter, fail.* — без повтора, идемпотентность, воркер (src/worker.ts, в pnpm dev вместе с API), pnpm jobs:list / jobs:run, тесты с startTestWorker/drainJobs. Использовать для «по расписанию», «раз в час», «в фоне», «рассылка», «пересчитать», «напоминание» — аналог шаблонов задач GaskarFM.
---

# Фоновые задачи

> Статус: сверено с кодом в фазе 1 (пункт 1.6). Образцы — `apps/api/src/kernel/jobs.test.ts`.

Очередь — pg-boss в той же Postgres (D-008, схема `pgboss`, в тестах — `pgboss_<n>` на процесс; `BOSS_SCHEMA`).
Очередь задачи создаётся сама при первой постановке или старте воркера. Воркер — отдельный процесс `apps/api/src/worker.ts`
(в проде масштабируется отдельно от API; локально `pnpm dev` запускает его вместе с API).

## Задача

```ts
// apps/api/src/modules/learning/jobs.ts
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { recalcProgress } from './progress.service.ts'
import { openDueLessons } from './drip.service.ts'

export const recalcProgressJob = defineJob({
	name: 'learning.recalc-progress', // <модуль>.<действие>, kebab-case; это имя очереди — не переименовывать
	schema: z.object({ enrollmentId: z.uuid() }), // данные — идентификаторы, объект перечитывается в handler
	singletonKey: (d) => d.enrollmentId, // не ставить дубль, пока такая же ждёт (ключ — в пределах школы)
	retry: { limit: 5, backoff: true }, // по умолчанию 3 с нарастанием
	handler: (ctx, d) => recalcProgress(ctx, d.enrollmentId), // ctx: BaseCtx — транзакция школы задачи
})

export const dripJob = defineJob({
	name: 'learning.open-due-lessons',
	schema: z.object({}),
	scope: 'all-schools', // ядро обходит активные школы, своя транзакция на школу (forEachSchool)
	schedule: '*/15 * * * *', // cron по Москве; расписание — только у all-schools (и у global задач ядра)
	timeoutSeconds: 600, // по умолчанию 300
	handler: (ctx) => openDueLessons(ctx),
})
```

Регистрация — в модуле: `defineModule({ name: 'learning', router, permissions, jobs: [recalcProgressJob, dripJob] })`
(имя задачи — с префиксом модуля, иначе ошибка на старте).

Постановка — из сервиса, в транзакции запроса:

```ts
await ctx.jobs.send(recalcProgressJob, { enrollmentId }) // откат транзакции — задачи нет
await ctx.jobs.send(reminderJob, { deadlineId }, { startAfter: dueAt }) // отложенно: Date или секунды
```

Школа добавляется к данным сама; в handler `ctx.school` — школа, поставившая задачу (приостановленная или удалённая к
моменту запуска — задача пропускается). `ctx` — `BaseCtx` (`db`, `school`, `now`, `log`, `emit`, `jobs`): пользователя
нет, поэтому сервисы для задач принимают `BaseCtx`.

## Правила

- **Идемпотентность**: задача может выполниться повторно (повтор, рестарт воркера) — повтор не должен удваивать эффект
  (проверяй состояние, `singletonKey`, уникальные индексы, «уже отправлено — выйти»).
- Данные — **идентификаторы**, не объекты целиком; секреты (токены) в данные задачи не кладутся — они лежат в БД
  открытым текстом до очистки.
- Ошибка бизнес-правила (`fail.*`) и данные не по схеме повтором не исправить — задача сразу `failed`, без повторов;
  остальные ошибки (сеть, гонка) — повтор по `retry`.
- Долгая работа по многим записям — батчами по 500 или отдельной задачей на батч; одна попытка ≤ `timeoutSeconds`.
- Внешние вызовы (почта, видео) — только в задачах, не в запросе пользователя.
- Время — `ctx.now()`.

## Отладка

- `pnpm jobs:list` — задачи реестра, расписания, сколько ждут и выполняются.
- `pnpm jobs:run <имя> --school <slug> --data '{…}'` — выполнить сейчас в этом процессе (без очереди).
- Логи задачи — с `job`, `jobId`, `schoolId`.

## Тест

```ts
import { drainJobs, jobStates, startTestWorker, stopTestWorker } from '#/test/jobs.ts'

beforeAll(startTestWorker) // настоящий воркер pg-boss в процессе теста
afterAll(stopTestWorker)

it('…', async () => {
	await withTenant(s.school.id, (tx) => tenantCtx(tx, s.school, { now, log }).jobs.send(recalcProgressJob, { enrollmentId }))
	await drainJobs() // ждёт, пока выполнятся все готовые задачи, включая поставленные по ходу
	expect((await jobStates('learning.recalc-progress')).map((j) => j.state)).toEqual(['completed'])
})
```

Задачи ядра без школы — `scope: 'global'` (`GlobalJobDef`, ctx — только `now` и `log`, таблицы — глобальным
клиентом БД; пример — `rate-limit.cleanup` в `kernel/rate-limit/rate-limit.ts`); модулю такую задачу объявить нельзя
(`defineModule` — ошибка). Задачу all-schools проверяют прямым вызовом `runJob(job, { data: {} }, { jobId: 'test' })` (`kernel/worker-runtime.ts`).

## Готово, когда

Тест handler на реальной БД, повторный запуск не меняет результат, `pnpm check` зелёный.

## Закрытая школа

Задача школы, чья школа не `active` (удаляется, приостановлена), **пропускается** (`log.warn('school is not active, job
skipped')`): письма и пересчёты закрытой школы не нужны. Исключение — задачи ядра о жизненном цикле школы с `inactiveSchool: true`
(письма владельцу об удалении, `kernel/school-deletion`); модулям флаг не нужен.

## Остановись и спроси, если

- задача должна идти чаще раза в минуту или обрабатывать > 100 тыс. записей за запуск;
- нужна гарантированная доставка во внешнюю систему с подтверждением (вебхуки — R3).
