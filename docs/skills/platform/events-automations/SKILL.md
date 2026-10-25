---
name: events-automations
description: Доменные события Dinastia — defineEvent в modules/<m>/events.ts (имя <сущность>.<прошедшее время>, zod-схема), ctx.emit — задачи подписчиков в транзакции запроса (outbox = pg-boss, D-045), подписчики on(event, handler) в других модулях (асинхронно через задачи, идемпотентно), список событий MVP; после MVP — автоматизации школы — каталог триггеров defineTrigger (из событий), условий и действий defineAction (письмо, Telegram, зачислить, назначить тег). Использовать для «когда X — сделать Y», «при завершении урока», «реагировать на событие», «автоматизация», «автоворонка».
---

# События и автоматизации

> Статус: события — сверено с кодом в фазе 1 (пункт 1.6, образец — `apps/api/src/kernel/jobs.test.ts`);
> автоматизации — релиз R3 (целевое).

События MVP — `docs/specs/domain.md` §4.

## Событие

```ts
// apps/api/src/modules/learning/events.ts
import { z } from 'zod'
import { defineEvent, on } from '#/kernel/events.ts'
import { quizGraded, submissionReviewed } from '../assessments/events.ts'
import { markBlockGraded } from './progress.service.ts'

export const lessonCompleted = defineEvent(
	'lesson.completed', // <сущность>.<прошедшее_время>, snake_case; неизменяемо
	z.object({ enrollmentId: z.uuid(), lessonId: z.uuid() }),
)

export const subscribers = [
	on(quizGraded, (ctx, e) => markBlockGraded(ctx, { attemptId: e.attemptId })),
	on(submissionReviewed, (ctx, e) =>
		e.status === 'accepted' ? markBlockGraded(ctx, { submissionId: e.submissionId }) : undefined,
	),
]
// modules/learning/index.ts: defineModule({ name: 'learning', …, subscribers })
```

- Данные — идентификаторы и факты на момент события (статус), не объекты целиком; без секретов.
- `ctx.emit(lessonCompleted, {...})` проверяет данные схемой и **в той же транзакции** ставит по задаче pg-boss на
  каждого подписчика (`<модуль>.on.<событие>`, D-045 — это и есть outbox). Откат транзакции — события не было; после
  коммита воркер выполняет подписчиков асинхронно, с повторами (скилл `background-jobs`).
- Подписчик — в модуле, которому нужна реакция (зависимость направлена к источнику события); `ctx` — `BaseCtx` школы
  события; handler **идемпотентен**. Два подписчика модуля на одно событие — `on(event, fn, { key: 'второй' })`.
- Подписчик может поставить задачу или выпустить своё событие (`ctx.jobs.send`, `ctx.emit`) — цепочка
  «событие → подписчик → задача».
- Синхронная реакция внутри той же транзакции — не событие, а вызов сервиса.

## Когда событие, а когда вызов

| Ситуация                                                | Как                                                 |
| ------------------------------------------------------- | --------------------------------------------------- |
| модулю A нужен результат модуля B сейчас                | вызов `B/service.ts`                                |
| модулю B надо отреагировать на факт в A, A о B не знает | событие A, подписчик в B                            |
| письмо/уведомление по факту                             | подписчик → `ctx.mail.send` (скилл `notifications`) |
| пересчёт после факта                                    | подписчик → функция пересчёта или задача            |

## Автоматизации школы (R3)

Владелец школы собирает правило «триггер → условия → действия» в UI; правило хранится реляционно: `automations`, `automation_conditions`, `automation_actions` + таблица параметров на
тип действия (как у блоков, D-034). Каталог — реестр:

```ts
// apps/api/src/modules/automations/catalog/triggers.ts
defineTrigger({ key: 'lesson.completed', event: lessonCompleted, title: 'automations:triggers.lessonCompleted',
  fields: { courseId: 'course', lessonId: 'lesson' } })        // по чему можно задать условие

// apps/api/src/modules/automations/catalog/actions.ts
defineAction({ key: 'send_email', schema: z.object({ templateId: Id }), perm: 'automations.manage',
  run: (ctx, params, subject) => … })
```

Новый триггер — это существующее событие + описание полей; новое действие — `defineAction` со схемой параметров,
редактором параметров в UI и идемпотентным `run`.

## Готово, когда

Тест (`startTestWorker`/`drainJobs`, скилл `background-jobs`): действие → подписчик выполнил реакцию; откат
транзакции — реакции нет; повтор подписчика не дублирует эффект; `pnpm check` зелёный (дубли имён задач — ошибка на
старте; `check:registries` — пункт 1.5).

## Остановись и спроси, если

- нужна строгая последовательность обработки событий одной сущности;
- событие должно уходить во внешнюю систему (вебхуки) — R3.
