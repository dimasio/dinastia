---
name: module
description: Доменный модуль Dinastia — из чего состоит (apps/api/src/modules/<m>/ schema, service, router, permissions, policies, events, jobs, settings, index.ts с defineModule; packages/contracts/src/<m>.ts; apps/web/src/features/<m>/ ресурсы, экраны, nav.ts), правила зависимостей между модулями, создать модуль генератором pnpm gen:module, куда класть новую сущность и какой скилл открыть для каждого вида работы. Использовать первым при любой разработке продукта и на вопросы «где это лежит», «создай модуль».
---

# Модуль

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.1).

Архитектура — `docs/specs/architecture.md` §2. Модуль — вертикальный срез: БД + контракт + сервис + права + экраны
одной части предметной области (`courses`, `learning`…). Список модулей — `docs/specs/domain.md` §1.

## Состав

```
packages/contracts/src/<m>.ts           zod-схемы сущностей + контракт oRPC        → api-endpoints
apps/api/src/modules/<m>/
  schema.ts                             таблицы Drizzle                             → db-schema
  service.ts  (или <часть>.service.ts)  бизнес-логика, публичный API модуля         → data-access
  router.ts                             реализация контракта                        → api-endpoints
  permissions.ts                        definePermissions                           → permissions
  policies.ts                           ограничения на уровне записи                → permissions
  events.ts                             defineEvent, подписчики on()                → events-automations
  jobs.ts                               defineJob                                   → background-jobs
  settings.ts                           defineSettings                              → settings
  emails/*.tsx                          defineEmail                                 → notifications
  index.ts                              defineModule({...})
  *.test.ts                             тесты                                       → testing
apps/web/src/features/<m>/
  resources/*.ts                        defineResource (реестры и формы)            → admin-resource
  components/, <экран>/                 продуктовые экраны                          → web-screens, ui-kit
  nav.ts                                пункты меню областей                        → web-screens
apps/web/src/routes/admin/<m>/…         маршруты                                    → web-screens
packages/i18n/locales/ru/<m>.json       строки                                      → i18n
```

`index.ts` модуля:

```ts
import { defineModule } from '@/kernel/module'
import { router } from './router'
import { permissions } from './permissions'
import { subscribers } from './events'
import { jobs } from './jobs'
import { settings } from './settings'

export default defineModule({ name: 'courses', router, permissions, subscribers, jobs, settings })
```

Модуль подключается строкой в `apps/api/src/modules/index.ts`, контракт — в `packages/contracts/src/index.ts`,
фича — в `apps/web/src/features/index.ts` (генератор делает всё три).

## Правила зависимостей

- Модуль читает и пишет **только свои таблицы**. Нужны данные другого модуля — функция из его `service.ts`
  (экспорт = публичный API) или подписка на его событие.
- Циклы запрещены: `learning → courses` можно, `courses → learning` — через событие. Направления — схема в
  `docs/specs/architecture.md` §2; `pnpm check` (dependency-cruiser) ловит нарушения.
- Ядро (`@/kernel/*`) доступно всем модулям; модули из ядра не импортируются.

## Создать модуль

1. Имя модуля даёт человек (латиница, единое слово или kebab-case).
2. `pnpm gen:module <name>` — создаёт все файлы с пустыми заготовками и регистрирует модуль.
3. Сущности: `db-schema` → `api-endpoints` → `permissions` → `admin-resource`/`web-screens`.
4. `pnpm check`.

## Куда класть

| Хочу | Куда |
|---|---|
| новая сущность предметной области | таблица в модуле, которому она принадлежит по `domain.md`; нет подходящего — спроси |
| общая zod-схема (email, телефон, деньги, RichText, пагинация) | `packages/contracts/src/common/` |
| общий UI-компонент | `packages/ui` — это ядро; в модуле — `features/<m>/components` |
| вспомогательная функция ядра (новый хелпер БД) | запрос к ядру (`AGENTS.md`) |

## Готово, когда

`pnpm check` зелёный; модуль виден в `/api/openapi.json`; пункты меню видны ролям из `permissions.ts`.

## Остановись и спроси, если

- не ясно, какому модулю принадлежит сущность;
- нужна зависимость, создающая цикл;
- нужна правка `@/kernel/*` или `packages/ui`.
