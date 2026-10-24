---
name: events-automations
description: Доменные события Dinastia — defineEvent в modules/<m>/events.ts (имя <сущность>.<прошедшее время>, zod-схема), ctx.emit с доставкой после коммита через outbox, подписчики on(event, handler) в других модулях (асинхронно через задачи, идемпотентно), список событий MVP; после MVP — автоматизации школы: каталог триггеров defineTrigger (из событий), условий и действий defineAction (письмо, Telegram, зачислить, назначить тег). Использовать для «когда X — сделать Y», «при завершении урока», «реагировать на событие», «автоматизация», «автоворонка».
---

# События и автоматизации

> Статус: целевой — события — фаза 1 (пункт 1.6); автоматизации — релиз R3.

События MVP — `docs/specs/domain.md` §4.

## Событие

```ts
// apps/api/src/modules/learning/events.ts
import { z } from 'zod'
import { defineEvent, on } from '@/kernel/events'
import { quizGraded } from '../assessments/events'
import { submissionReviewed } from '../assessments/events'
import { markBlockGraded } from './progress.service'

export const lessonCompleted = defineEvent('lesson.completed', z.object({
  enrollmentId: z.string().uuid(),
  lessonId: z.string().uuid(),
}))

export const subscribers = [
  on(quizGraded, (ctx, e) => markBlockGraded(ctx, { attemptId: e.attemptId })),
  on(submissionReviewed, (ctx, e) => e.status === 'accepted'
    ? markBlockGraded(ctx, { submissionId: e.submissionId }) : undefined),
]
```

- Имя — `<сущность>.<что произошло>` в прошедшем времени (`enrollment.created`, `lesson.completed`), неизменяемо.
- Данные — идентификаторы и факты на момент события (статус), не объекты целиком.
- `ctx.emit(lessonCompleted, {...})` пишет событие в outbox в той же транзакции; после коммита ядро запускает
  подписчиков **асинхронно** (каждый — отдельной задачей pg-boss с retry). Откат транзакции — события не было.
- Подписчик — в модуле, которому нужна реакция (зависимость направлена к источнику события); handler
  **идемпотентен** (скилл `background-jobs`).
- Синхронная реакция внутри той же транзакции — не событие, а вызов сервиса.

## Когда событие, а когда вызов

| Ситуация | Как |
|---|---|
| модулю A нужен результат модуля B сейчас | вызов `B/service.ts` |
| модулю B надо отреагировать на факт в A, A о B не знает | событие A, подписчик в B |
| письмо/уведомление по факту | подписчик → `ctx.mail.send` (скилл `notifications`) |
| пересчёт после факта | подписчик → функция пересчёта или задача |

## Автоматизации школы (R3)

Владелец школы собирает правило «триггер → условия → действия» в UI; правило хранится в `automations` (JSONB со
схемой каталога). Каталог — реестр:

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

Тест: действие → событие в outbox → подписчик выполнил реакцию; повтор подписчика не дублирует эффект;
`pnpm check` зелёный (`check:registries`: уникальные имена, нет подписки на несуществующее событие).

## Остановись и спроси, если

- нужна строгая последовательность обработки событий одной сущности;
- событие должно уходить во внешнюю систему (вебхуки) — R3.
