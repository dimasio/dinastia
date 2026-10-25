---
status: draft
---

# Архитектура Dinastia

Устройство Dinastia. Документ `draft` до конца фазы 1: §1–4 и §7 сверены с кодом в фазе 0 (действуют), §5–6 и §8 —
целевые до фазы 1 (`docs/plan/roadmap.md`). Решения — `D-NNN` в `decisions.md`.

## 1. Стек

| Слой            | Выбор                                                                               | Решение |
| --------------- | ----------------------------------------------------------------------------------- | ------- |
| Язык | TypeScript 7 (нативный компилятор), `strict`, ESM | D-002, D-029 |
| Рантайм         | Node.js 24 LTS                                                                      | D-002   |
| Монорепо        | pnpm workspaces + Turborepo                                                         | D-003   |
| HTTP            | Hono (`@hono/node-server`)                                                          | D-004   |
| API             | oRPC: контракт на zod → типизированный клиент + OpenAPI                             | D-004   |
| Валидация       | zod 4 — единые схемы для API, форм, блоков                                          | D-004   |
| БД | PostgreSQL 18, Drizzle ORM + drizzle-kit (миграции), только реляционная модель | D-005, D-030, D-032 |
| Тенанты         | общая БД, `school_id` в каждой тенантной таблице + Row Level Security               | D-006   |
| Auth            | better-auth: email+пароль, magic link, плагин organization (школа = организация)    | D-007   |
| Фоновые задачи  | pg-boss (очередь в Postgres, без Redis)                                             | D-008   |
| Клиент          | React 19, Vite, TanStack Router (файловые маршруты), TanStack Query, TanStack Table | D-009   |
| UI              | Tailwind CSS 4 + shadcn/ui (копии компонентов в `packages/ui`), lucide-react        | D-009   |
| Формы           | react-hook-form + zodResolver                                                       | D-009   |
| Редактор текста | Tiptap (ProseMirror), JSON-документ                                                 | D-010   |
| Drag-n-drop     | dnd-kit                                                                             | D-010   |
| Файлы           | S3-совместимое хранилище (Yandex Object Storage / Selectel), локально SeaweedFS (D-037)         | D-011   |
| Видео           | провайдер за интерфейсом, по умолчанию Kinescope                                    | D-011   |
| Почта           | SMTP/API провайдер за интерфейсом, локально Mailpit                                 | D-012   |
| PDF             | HTML-шаблон → PDF (Playwright/Chromium в отдельной задаче)                          | D-013   |
| i18n            | i18next + react-i18next, ключи в `packages/i18n`                                    | D-014   |
| Тесты           | Vitest (unit + интеграционные на реальном Postgres), Playwright (e2e)               | D-015   |
| Линт/формат     | Biome                                                                               | D-003   |
| Логи/ошибки     | pino; Sentry-совместимый сбор (GlitchTip в РФ)                                      | D-016   |

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
  db/                          хелперы схемы Drizzle (ядро): schools, tenantTable, tenantRef, blockTable, blockChildTable,
                               settingsTable, richText, opaqueJson, pii, fk — общие для api и таблиц блоков
  ui/                          дизайн-система + ресурс-фреймворк (defineResource, ResourceTable, ResourceForm)
  blocks/                      реестр блоков уроков: src/<type>/{table.ts, definition.ts, editor.tsx, viewer.tsx}
  questions/                   реестр типов вопросов: src/<type>/{definition.ts, editor.tsx, viewer.tsx}
  i18n/                        локали ru (en позже), типы ключей
  config/                      tsconfig, biome, общие настройки
tools/                         генераторы (pnpm gen:*), проверки (check:registries, docs:check), skills:link
tests/e2e/                     сценарии Playwright
docs/                          документация (docs/README.md)
docker/                        compose для локального окружения
```

Зависимости пакетов (стрелка — «может импортировать»):
`web → contracts, ui, blocks, questions, i18n`; `api → contracts, db, blocks(definition, table), questions(definition), i18n`;
`blocks(table) → db`;
`blocks/questions → ui, i18n` (только `editor.tsx`/`viewer.tsx`); `contracts → zod`. **`api` не импортирует `*.tsx`; `web` не импортирует `table.ts` и `@dinastia/db`.**
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
HTTP → Hono → /api/rpc | /api/v1 (oRPC, один контракт) | /api/auth (better-auth)
  → errorsMw → mw.host (школа по хосту) → mw.session → mw.school → mw.tenantTx (транзакция школы) → mw.member
  → can('<perm>') (0.6) → handler → service(ctx, input)
```

Контекст цепочки «участник школы» (`apps/api/src/kernel/orpc.ts`, `schoolCtx()`; цепочки — скилл `api-endpoints` §2):

| Поле                                                                                        | Что                                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ctx.db`                                                                                    | Drizzle-транзакция с установленным `app.school_id`                                                    |
| `ctx.school`                                                                                | `{ id, slug, settings }`                                                                              |
| `ctx.user`                                                                                  | текущий пользователь                                                                                  |
| `ctx.member`                                                                                | `{ id, role }` в этой школе                                                                           |
| `ctx.can(perm)` | есть ли у участника разрешение (скилл `permissions`) |
| `ctx.emit(event)`                                                                           | доменное событие: задачи подписчиков в той же транзакции, выполняются после коммита (D-045)                                                         |
| `ctx.jobs.send(name, data)`                                                                 | поставить фоновую задачу (в той же транзакции)                                                        |
| `ctx.log`                                                                                   | pino-логгер с requestId, schoolId, userId                                                             |
| `ctx.audit(action, data)`                                                                   | запись в журнал действий (D-021)                                                                      |
| `ctx.http`                                                                                  | исходящие HTTP-запросы: таймауты, без приватных сетей (D-023)                                         |
| `ctx.settings`, `ctx.files`, `ctx.mail`, `ctx.documents`, `ctx.video`, `ctx.t`, `ctx.now()` | сервисы ядра (скиллы `settings`, `files-media`, `notifications`, `documents`, `integrations`, `i18n`) |

## 5. Реестры (low-code для разработчиков)

Реестр — набор однотипных расширений с общим контрактом и общей проверкой `pnpm check:registries`.

| Реестр                                     | Где                                                  | Контракт                        | Генератор                        | Скилл                |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------- | -------------------------------- | -------------------- |
| модули API                                 | `apps/api/src/modules/index.ts`                      | `defineModule`                  | `pnpm gen:module <name>`         | `module`             |
| блоки уроков                               | `packages/blocks/src/registry.ts`                    | `defineBlock`                   | `pnpm gen:block <type>`          | `lesson-blocks`      |
| типы вопросов                              | `packages/questions/src/registry.ts`                 | `defineQuestion`                | `pnpm gen:question <type>`       | `question-types`     |
| админ-ресурсы                              | `apps/web/src/features/<m>/resources/*.ts`           | `defineResource`                | `pnpm gen:resource <m> <entity>` | `admin-resource`     |
| разрешения                                 | `modules/<m>/permissions.ts`                         | `definePermissions`             | —                                | `permissions`        |
| события                                    | `modules/<m>/events.ts`                              | `defineEvent`, `on()`           | —                                | `events-automations` |
| задачи                                     | `modules/<m>/jobs.ts`                                | `defineJob`                     | —                                | `background-jobs`    |
| триггеры/действия автоматизаций (пост-MVP) | `modules/automations/catalog/*`                      | `defineTrigger`, `defineAction` | —                                | `events-automations` |
| настройки школы                            | `modules/<m>/settings.ts` (+ таблица `<m>_settings`) | `defineSettings`                | —                                | `settings`           |
| шаблоны писем                              | `modules/<m>/emails/*.tsx`                           | `defineEmail`                   | —                                | `notifications`      |

Общее у всех `define*`: уникальный ключ, zod-схема данных для API, заголовок и иконка для UI. Если реестр хранит
данные — у записи реестра есть **своя таблица** (D-034), а не JSON.

## 6. Реляционная модель (D-032)

Всё, что имеет структуру, связи или участвует в фильтрах, — **таблицы и типизированные колонки** с FK, enum, CHECK.
Документных «мешков» для структурных данных нет (в отличие от GaskarFM).

| Данные                                     | Как хранятся                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| блоки урока                                | `lesson_blocks` (общие поля) + таблица на тип блока `block_<type>` 1:1 (+ дочерние таблицы типа) — D-034                                                   |
| черновик и публикация                      | две версии строк блоков (`state = draft / published`) со стабильным `block_key` — D-033                                                                    |
| вопросы теста                              | `questions` + `question_items` (варианты, элементы порядка, пары сопоставления); изменение использованного вопроса — новая ревизия (copy-on-write) — D-035 |
| ответы учеников                            | `quiz_answers` (+ `quiz_answer_items`), `block_responses_<type>` для интерактивных блоков, `block_progress`                                                |
| настройки школы                            | таблица настроек модуля 1:1 со школой (`<module>_settings`, PK `school_id`) — D-036                                                                        |
| настройки курса, доступ и завершение урока | колонки `courses`, `lessons`                                                                                                                               |
| свои поля учеников (R3)                    | `custom_fields` + `custom_field_values` с типизированными колонками значения                                                                               |

**JSONB допускается только для непрозрачных данных**, внутрь которых БД не заглядывает (нет фильтров, связей,
частичных обновлений):

| Можно в JSONB                                                            | Почему                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| тело форматированного текста (документ Tiptap) — колонки `richText('…')` | дерево документа, рендерится целиком (скилл `rich-text`) |
| `audit_log.diff`                                                         | снимок «было/стало» для чтения человеком                 |
| `webhook_events.payload`; данные задач pg-boss (`pgboss.job.data`, D-045) | сырой ответ внешней системы / сообщение в доставке        |

Новое использование JSONB вне этого списка — решение `D-NNN` с согласия человека; `check:registries` разрешает
`jsonb` только через хелперы `richText()`, `opaqueJson()` ядра.

## 7. Клиент

- Две области: `/admin/**` (сотрудники школы) и `/learn/**` (ученики), общий вход `/_auth/**`. Область задаёт лэйаут,
  меню и набор разрешённых ролей.
- Данные — только через oRPC-клиент + TanStack Query (`orpc.<module>.<proc>.queryOptions(...)`); загрузка в `loader`
  маршрута через `ensureQueryData`.
- Экраны-реестры и формы сущностей — через ресурс-фреймворк `packages/ui/resource` (скилл `admin-resource`);
  продуктовые экраны (плеер урока, конструктор, проверка ДЗ) — вручную из компонентов `packages/ui`.
- Брендинг школы — CSS-переменные темы из настроек школы (скилл `ui-kit`).

## 8. Сквозные механизмы

| Механизм                    | Где                                                                                       | Скилл               |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| журнал действий `audit_log` | `kernel/audit.ts`                                                                         | `security-baseline` |
| rate limit                  | `kernel/rate-limit.ts` (middleware oRPC и auth)                                           | `security-baseline` |
| белый список встраиваний    | `kernel/embed-allowlist.ts`                                                               | `security-baseline` |
| исходящие запросы           | `kernel/http.ts`                                                                          | `integrations`      |
| входящие вебхуки            | `kernel/webhooks.ts`, `defineWebhookHandler`, `webhook_events`                            | `integrations`      |
| ПДн                         | `pii()` в схеме, редактор логов, `consents`, `exportMemberData`/`anonymizeMember` модулей | `personal-data`     |
| rich text                   | `packages/contracts/src/common/rich-text.ts`, `packages/ui/src/rich-text`                 | `rich-text`         |
| метрики и health            | `kernel/metrics.ts`, `/health/*`, `/metrics`                                              | `observability`     |

## 9. Команды

| Команда                                                                   | Что                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                                | api + web + воркер задач в watch-режиме                                                            |
| `pnpm check`                                                              | typecheck, lint, unit/интеграционные тесты, `check:registries`, `docs:check` — критерий готовности |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset`                | миграции и демо-данные                                                                             |
| `pnpm gen:module\|block\|question\|resource …`                            | генераторы                                                                                         |
| `pnpm test [-- <фильтр>]`                                                 | Vitest                                                                                             |
| `pnpm e2e [-- <сценарий>]`                                                | Playwright                                                                                         |
| `pnpm skills:link`                                                        | ссылки `.claude/skills/*` на `docs/skills/**`                                                      |
| `pnpm docs:check`                                                         | шапки, ссылки, таблица скиллов в `AGENTS.md`                                                       |
| `pnpm db:psql --as app_user --school <slug>` / `db:explain` / `db:studio` | отладка запросов под ролью приложения                                                              |
| `pnpm jobs:list` / `jobs:run`                                             | очереди задач                                                                                      |
| `pnpm emails:preview` / `documents:preview`                               | предпросмотр шаблонов                                                                              |
