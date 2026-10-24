---
status: draft
---

# Архитектура Dinastia

Целевое устройство. `draft` — до завершения фазы 1 (`docs/plan/roadmap.md`): при реализации ядра документ
сверяется с кодом и переводится в `current`. Решения — `D-NNN` в `decisions.md`.

## 1. Стек

| Слой | Выбор | Решение |
|---|---|---|
| Язык | TypeScript 5.x, `strict`, ESM | D-002 |
| Рантайм | Node.js 24 LTS | D-002 |
| Монорепо | pnpm workspaces + Turborepo | D-003 |
| HTTP | Hono (`@hono/node-server`) | D-004 |
| API | oRPC: контракт на zod → типизированный клиент + OpenAPI | D-004 |
| Валидация | zod 4 — единые схемы для API, форм, блоков | D-004 |
| БД | PostgreSQL 17+, Drizzle ORM + drizzle-kit (миграции) | D-005 |
| Тенанты | общая БД, `school_id` в каждой тенантной таблице + Row Level Security | D-006 |
| Auth | better-auth: email+пароль, magic link, плагин organization (школа = организация) | D-007 |
| Фоновые задачи | pg-boss (очередь в Postgres, без Redis) | D-008 |
| Клиент | React 19, Vite, TanStack Router (файловые маршруты), TanStack Query, TanStack Table | D-009 |
| UI | Tailwind CSS 4 + shadcn/ui (копии компонентов в `packages/ui`), lucide-react | D-009 |
| Формы | react-hook-form + zodResolver | D-009 |
| Редактор текста | Tiptap (ProseMirror), JSON-документ | D-010 |
| Drag-n-drop | dnd-kit | D-010 |
| Файлы | S3-совместимое хранилище (Yandex Object Storage / Selectel), локально MinIO | D-011 |
| Видео | провайдер за интерфейсом, по умолчанию Kinescope | D-011 |
| Почта | SMTP/API провайдер за интерфейсом, локально Mailpit | D-012 |
| PDF | HTML-шаблон → PDF (Playwright/Chromium в отдельной задаче) | D-013 |
| i18n | i18next + react-i18next, ключи в `packages/i18n` | D-014 |
| Тесты | Vitest (unit + интеграционные на реальном Postgres), Playwright (e2e) | D-015 |
| Линт/формат | Biome | D-003 |
| Логи/ошибки | pino; Sentry-совместимый сбор (GlitchTip в РФ) | D-016 |

## 2. Раскладка репозитория

```
apps/
  api/                         сервер (Hono + oRPC)
    src/
      kernel/                  ЯДРО: db, tenant, auth, orpc, permissions, events, jobs, storage, video, mail, documents,
                               settings, audit, http, webhooks, rate-limit, embed-allowlist, errors, config
      modules/                 ПРОДУКТ: доменные модули
        <module>/
          schema.ts            таблицы Drizzle модуля
          service.ts           бизнес-логика (функции от ctx)
          router.ts            реализация контракта oRPC
          permissions.ts       разрешения модуля и роли по умолчанию
          policies.ts          проверки на уровне записи (необязательно)
          events.ts            события модуля и подписчики (необязательно)
          jobs.ts              фоновые задачи (необязательно)
          index.ts             defineModule({...}) — регистрация
          *.test.ts            тесты
        index.ts               список модулей
    drizzle/                   миграции (генерирует drizzle-kit)
  web/                         клиент (SPA)
    src/
      routes/                  файловые маршруты TanStack Router
        _auth/                 вход, регистрация школы, magic link
        admin/                 кабинет школы (владелец, админ, преподаватель, куратор)
        learn/                 кабинет ученика
        ops/                   консоль оператора SaaS (фаза 5, D-026)
      features/<module>/       экраны, хуки запросов, ресурсы модуля
      app/                     провайдеры, oRPC-клиент, i18n, тема
  site/                        (пост-MVP) публичный сайт школы, SSR
packages/
  contracts/                   контракты oRPC + zod-схемы сущностей (общие для api и web)
  ui/                          дизайн-система + ресурс-фреймворк (defineResource, ResourceTable, ResourceForm)
  blocks/                      реестр блоков уроков: src/<type>/{definition.ts, editor.tsx, viewer.tsx}
  questions/                   реестр типов вопросов: src/<type>/{definition.ts, editor.tsx, viewer.tsx}
  i18n/                        локали ru (en позже), типы ключей
  config/                      tsconfig, biome, общие настройки
tools/                         генераторы (pnpm gen:*), проверки (check:registries, docs:check), skills:link
tests/e2e/                     сценарии Playwright
docs/                          документация (docs/README.md)
docker/                        compose для локального окружения
```

Зависимости пакетов (стрелка — «может импортировать»):
`web → contracts, ui, blocks, questions, i18n`; `api → contracts, blocks(definition), questions(definition), i18n`;
`blocks/questions → ui, i18n` (только `editor.tsx`/`viewer.tsx`); `contracts → zod`. **`api` не импортирует `*.tsx`.**
Модуль импортирует другой модуль **только через его `service.ts`** (публичный API модуля) или события; таблицы чужого
модуля напрямую не пишет.

## 3. Тенантность

- Тенант — **школа** (`schools`, она же organization better-auth). Пользователь (`users`) глобален: один человек может
  быть учеником в одной школе и преподавателем в другой. Членство — `members (school_id, user_id, role)`.
- Школа определяется по хосту запроса: `<slug>.<домен>` (позже — свой домен школы, таблица `school_domains`);
  кабинет владельца на корневом домене выбирает школу из списка членств.
- Каждая тенантная таблица: `school_id uuid not null` + RLS-политика
  `school_id = current_setting('app.school_id')::uuid`. Приложение подключается ролью `app_user` без `BYPASSRLS`;
  миграции — ролью `app_owner`.
- Запрос школы выполняется в транзакции, в начале которой `set_config('app.school_id', $id, true)`. Это делает
  ядро (`withTenant`), продуктовый код получает уже настроенный `ctx.db`.
- Системные задачи по всем школам (рассылки, пересчёты) — через `forEachSchool()` ядра, по одной транзакции на школу.

## 4. Запрос: путь и контекст

```
HTTP → Hono → better-auth (сессия) → резолв школы по хосту → oRPC
  → базовая процедура (pub | authed | school) → can('<perm>') → handler → service(ctx, input)
```

Контекст процедуры `school` (`apps/api/src/kernel/orpc.ts`):

| Поле | Что |
|---|---|
| `ctx.db` | Drizzle-транзакция с установленным `app.school_id` |
| `ctx.school` | `{ id, slug, settings }` |
| `ctx.user` | текущий пользователь |
| `ctx.member` | `{ id, role }` в этой школе |
| `ctx.can(perm, resource?)` | проверка права |
| `ctx.emit(event)` | доменное событие (отправляется после коммита) |
| `ctx.jobs.send(name, data)` | поставить фоновую задачу (в той же транзакции) |
| `ctx.log` | pino-логгер с requestId, schoolId, userId |
| `ctx.audit(action, data)` | запись в журнал действий (D-021) |
| `ctx.http` | исходящие HTTP-запросы: таймауты, без приватных сетей (D-023) |
| `ctx.settings`, `ctx.files`, `ctx.mail`, `ctx.documents`, `ctx.video`, `ctx.t`, `ctx.now()` | сервисы ядра (скиллы `settings`, `files-media`, `notifications`, `documents`, `integrations`, `i18n`) |

## 5. Реестры (low-code для разработчиков)

Реестр — набор однотипных расширений с общим контрактом и общей проверкой `pnpm check:registries`.

| Реестр | Где | Контракт | Генератор | Скилл |
|---|---|---|---|---|
| модули API | `apps/api/src/modules/index.ts` | `defineModule` | `pnpm gen:module <name>` | `module` |
| блоки уроков | `packages/blocks/src/registry.ts` | `defineBlock` | `pnpm gen:block <type>` | `lesson-blocks` |
| типы вопросов | `packages/questions/src/registry.ts` | `defineQuestion` | `pnpm gen:question <type>` | `question-types` |
| админ-ресурсы | `apps/web/src/features/<m>/resources/*.ts` | `defineResource` | `pnpm gen:resource <m> <entity>` | `admin-resource` |
| разрешения | `modules/<m>/permissions.ts` | `definePermissions` | — | `permissions` |
| события | `modules/<m>/events.ts` | `defineEvent`, `on()` | — | `events-automations` |
| задачи | `modules/<m>/jobs.ts` | `defineJob` | — | `background-jobs` |
| триггеры/действия автоматизаций (пост-MVP) | `modules/automations/catalog/*` | `defineTrigger`, `defineAction` | — | `events-automations` |
| настройки школы | `modules/<m>/settings.ts` | `defineSettings` | — | `settings` |
| шаблоны писем | `modules/<m>/emails/*.tsx` | `defineEmail` | — | `notifications` |

Общее у всех `define*`: уникальный ключ, zod-схема данных, версия схемы данных и миграции между версиями (там, где
данные хранятся в JSONB), заголовок и иконка для UI.

## 6. Данные в JSONB

Контент уроков (блоки), настройки школы, свои поля учеников — JSONB со схемой из реестра. Правила:

- каждая запись хранит `type` и `v` (версию схемы); чтение — через `parse()` реестра, который применяет миграции `v→v+1`;
- запись — только после `schema.parse()`;
- поиск и связи — **не** по JSONB: что нужно фильтровать или связывать, выносится в колонку/таблицу.

## 7. Клиент

- Две области: `/admin/**` (сотрудники школы) и `/learn/**` (ученики), общий вход `/_auth/**`. Область задаёт лэйаут,
  меню и набор разрешённых ролей.
- Данные — только через oRPC-клиент + TanStack Query (`orpc.<module>.<proc>.queryOptions(...)`); загрузка в `loader`
  маршрута через `ensureQueryData`.
- Экраны-реестры и формы сущностей — через ресурс-фреймворк `packages/ui/resource` (скилл `admin-resource`);
  продуктовые экраны (плеер урока, конструктор, проверка ДЗ) — вручную из компонентов `packages/ui`.
- Брендинг школы — CSS-переменные темы из настроек школы (скилл `ui-kit`).

## 8. Сквозные механизмы

| Механизм | Где | Скилл |
|---|---|---|
| журнал действий `audit_log` | `kernel/audit.ts` | `security-baseline` |
| rate limit | `kernel/rate-limit.ts` (middleware oRPC и auth) | `security-baseline` |
| белый список встраиваний | `kernel/embed-allowlist.ts` | `security-baseline` |
| исходящие запросы | `kernel/http.ts` | `integrations` |
| входящие вебхуки | `kernel/webhooks.ts`, `defineWebhookHandler`, `webhook_events` | `integrations` |
| ПДн | `pii()` в схеме, редактор логов, `consents`, `exportMemberData`/`anonymizeMember` модулей | `personal-data` |
| rich text | `packages/contracts/src/common/rich-text.ts`, `packages/ui/src/rich-text` | `rich-text` |
| метрики и health | `kernel/metrics.ts`, `/health/*`, `/metrics` | `observability` |

## 9. Команды

| Команда | Что |
|---|---|
| `pnpm dev` | api + web + воркер задач в watch-режиме |
| `pnpm check` | typecheck, lint, unit/интеграционные тесты, `check:registries`, `docs:check` — критерий готовности |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` | миграции и демо-данные |
| `pnpm gen:module\|block\|question\|resource …` | генераторы |
| `pnpm test [-- <фильтр>]` | Vitest |
| `pnpm e2e [-- <сценарий>]` | Playwright |
| `pnpm skills:link` | ссылки `.claude/skills/*` на `docs/skills/**` |
| `pnpm docs:check` | шапки, ссылки, таблица скиллов в `AGENTS.md` |
| `pnpm db:psql --as app_user --school <slug>` / `db:explain` / `db:studio` | отладка запросов под ролью приложения |
| `pnpm jobs:list` / `jobs:run` | очереди задач |
| `pnpm emails:preview` / `documents:preview` | предпросмотр шаблонов |
