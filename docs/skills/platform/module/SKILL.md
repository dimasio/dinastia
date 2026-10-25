---
name: module
description: Доменный модуль Dinastia — из чего состоит (apps/api/src/modules/<m>/ schema, service, router, permissions, policies, events, jobs, settings, index.ts с defineModule; packages/contracts/src/<m>.ts; apps/web/src/features/<m>/ ресурсы, экраны, nav.ts), правила зависимостей между модулями, создать модуль генератором pnpm gen:module, куда класть новую сущность и какой скилл открыть для каждого вида работы. Использовать первым при любой разработке продукта и на вопросы «где это лежит», «создай модуль».
---

# Модуль

> Статус: сверено с кодом в фазе 1 (1.1; 1.6: `jobs`, `subscribers` в `defineModule`); настройки модуля — позже.

Архитектура — `docs/specs/architecture.md` §2. Модуль — вертикальный срез: БД + контракт + сервис + права + экраны
одной части предметной области (`courses`, `learning`…). Список модулей — `docs/specs/domain.md` §1.

## Состав

```
packages/contracts/src/<m>.ts           zod-схемы сущностей + контракт oRPC        → api-endpoints
apps/api/src/modules/<m>/
  index.ts                              defineModule({ name, router, permissions, jobs?, subscribers?, emails? })
  schema.ts                             таблицы Drizzle                             → db-schema
  service.ts  (или <часть>.service.ts)  бизнес-логика, публичный API модуля         → data-access
  router.ts                             реализация контракта                        → api-endpoints
  permissions.ts                        definePermissions('<m>', …)                 → permissions
  policies.ts                           ограничения на уровне записи (фаза 2+)      → permissions
  events.ts                             defineEvent модуля + подписчики on() на чужие → events-automations
  jobs.ts                               defineJob — фоновые задачи <m>.<действие>   → background-jobs
  emails/*.tsx                          defineEmail — письма <m>.<письмо>           → notifications
  settings.ts                           настройки школы (позже)                     → settings
  *.test.ts                             тесты                                       → testing
apps/web/src/features/<m>/
  nav.ts                                пункты меню областей (defineNav)            → web-screens
  resources/*.ts                        defineResource (фаза 1.2)                   → admin-resource
  <экран>/, components/                 продуктовые экраны                          → web-screens, ui-kit
apps/web/src/routes/admin/<m>/…         маршруты                                    → web-screens
packages/i18n/locales/ru/<m>.json       строки (namespace — camelCase имени)        → i18n
```

`index.ts` модуля (образец — `apps/api/src/modules/schools/index.ts`):

```ts
import { defineModule } from '#/kernel/module.ts'
import { permissions } from './permissions.ts'
import { invitationsRouter, schoolsRouter } from './router.ts'

export default defineModule({
	name: 'schools',                                               // = папка и префикс разрешений (проверяется)
	router: { schools: schoolsRouter, invitations: invitationsRouter }, // namespace контракта → процедуры
	permissions,
})
```

Реестры, куда модуль подключается (генератор вписывает строки у маркеров `// gen:module:<место>`):

| Реестр | Файл |
|---|---|
| модули API → роутер (`collectRouters`) | `apps/api/src/modules/index.ts` |
| разрешения → тип `Permission`, `can` | `apps/api/src/permissions.ts` |
| таблицы → drizzle-kit | `apps/api/src/db-schema.ts` |
| контракт | `packages/contracts/src/index.ts` |
| строки | `packages/i18n/src/index.ts` |
| меню | `apps/web/src/features/index.ts` |

Один namespace контракта — только в одном модуле (`collectRouters` падает на старте).

## Правила зависимостей

- Модуль читает и пишет **только свои таблицы**. Нужны данные другого модуля — функция из его `service.ts`
  (экспорт = публичный API) или подписка на его событие.
- Циклы запрещены: `learning → courses` можно, `courses → learning` — через событие. Направления — схема в
  `docs/specs/architecture.md` §2; `pnpm check` (dependency-cruiser) ловит нарушения.
- Ядро (`#/kernel/*`) доступно всем модулям; модули из ядра не импортируются.

## Создать модуль

1. Имя модуля даёт человек: kebab-case латиницей (`courses`, `question-bank`).
2. `pnpm gen:module <имя> --title "Название"` (сначала можно `--dry-run` — покажет изменения). Создаёт заготовки и
   вписывает модуль во все реестры; повторный запуск отказывается что-либо перезаписывать.
3. Сущности: `db-schema` → `api-endpoints` → `permissions` → экраны (`admin-resource`/`web-screens`), пункт меню в
   `features/<m>/nav.ts`.
4. `pnpm check`.

Генератор проверяется в CI: пробный модуль должен проходить typecheck, lint и тесты без правок.

## Куда класть

| Хочу                                                          | Куда                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| новая сущность предметной области                             | таблица в модуле, которому она принадлежит по `domain.md`; нет подходящего — спроси |
| общая zod-схема (email, телефон, деньги, RichText, пагинация) | `packages/contracts/src/common/`                                                    |
| общий UI-компонент                                            | `packages/ui` — это ядро; в модуле — `features/<m>/components`                      |
| вспомогательная функция ядра (новый хелпер БД)                | запрос к ядру (`AGENTS.md`)                                                         |

## Готово, когда

`pnpm check` зелёный; модуль виден в `/api/openapi.json`; пункты меню видны ролям из `permissions.ts`.

## Остановись и спроси, если

- не ясно, какому модулю принадлежит сущность;
- нужна зависимость, создающая цикл;
- нужна правка `#/kernel/*` или `packages/ui`.
