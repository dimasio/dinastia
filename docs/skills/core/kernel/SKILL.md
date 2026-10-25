---
name: core-kernel
description: Устройство и доработка ядра Dinastia (только с разрешения человека или в задачах фаз 0–1) — apps/api/src/kernel (db и роли Postgres, tenantTable и RLS, withTenant и forEachSchool, better-auth и резолв школы по хосту, базовые процедуры oRPC pub/authed/school и can, контекст запроса, permissions, events с outbox, jobs на pg-boss, storage S3, mail, documents, settings, config, errors fail), packages/ui/resource, механика реестров define* и как добавить новый реестр (тип, registry, check:registries, генератор, скилл), генераторы tools/gen, правила изменения контрактов ядра. Использовать для задач «доработай ядро», «новый хелпер», «новый реестр», «генератор», «почини RLS/auth».
---

# Ядро

> Статус: карта сверена с кодом в конце фазы 0 (пункт 0.10); строки «фаза N» — ещё не реализованы.

Ядро меняется **только** с явного разрешения человека в задаче или в задаче фаз 0–1 (`AGENTS.md`). Архитектура —
`docs/specs/architecture.md`; изменение, которое меняет поведение для модулей, — правка этой спеки и затронутых
скиллов `platform/*` в той же задаче.

## Карта

Пути — от `apps/api/src/`, если не указано иное. «Есть» — сверено с кодом; «фаза N» — ещё не реализовано.

| Часть | Где | Что | Состояние | Скилл |
|---|---|---|---|---|
| хелперы схемы | `packages/db` (`@dinastia/db`) | `schools`, `tenantTable`, `tenantRef`, `currentSchoolId`, `richText`, `opaqueJson`, `appUser` | есть; `blockTable`, `settingsTable` — 1.3/1.6, `pii` — 1.11 | `db-schema` |
| БД | `kernel/db/{client,tenant,admin,cli,rls-coverage,listing}.ts` | пул `app_user`, `withTenant`, `withUser`, миграции/reset под `app_owner`, проверка покрытия RLS, списки `listQuery`/`toPage` | есть; `forEachSchool` — 1.6 | `data-access` |
| конфиг | `kernel/config.ts` | zod-схема env, `.env` локально, `appOrigin()` | есть | `settings` |
| ошибки | `kernel/errors.ts` | `AppError`, `fail.*` | есть | `data-access` |
| auth | `kernel/auth/{auth,schema}.ts`, `kernel/host.ts`, `kernel/client-ip.ts` | better-auth (пароль, magic link, rate limit в БД, origin-check явно — D-040, IP — D-042), согласия, школа по хосту | есть | `lms-school`, `security-baseline` |
| членство | `kernel/members/{schema,members}.ts` | `members` (RLS + «свои членства» только вне школы), `findActiveMember` | есть | `lms-school`, `permissions` |
| oRPC | `kernel/orpc.ts`, `kernel/context.ts`, `router.ts`, `app.ts` | `impl` + `errorsMw`, `mw.host/session/school/tenantTx/member`, `schoolCtx`, входы `/api/rpc`, `/api/v1`, `/api/openapi.json` | есть | `api-endpoints` |
| права | `kernel/permissions.ts`, `kernel/router-guard.ts`, `permissions.ts` | `definePermissions`, `mergePermissions`, `createCan`, страж «у процедуры участника есть can()» | есть | `permissions` |
| логи, health | `kernel/log.ts`, `app.ts` | pino с маскированием ПДн, `ctx.log`, `x-request-id`, `/health/live|ready` | есть | `observability` |
| почта | `kernel/mail.ts` | `sendMail` (SMTP / memory в тестах) | есть (временная); `defineEmail` + очередь — 1.8 | `notifications` |
| модули | `kernel/module.ts`, `modules/index.ts` | `defineModule`, `collectRouters`; генератор `pnpm gen:module` (`tools/src/gen/`, вставка у маркеров `gen:`) | есть; события, задачи, настройки в модуле — 1.6 | `module` |
| события, задачи | `kernel/events/*`, `kernel/jobs/*` | outbox, `defineEvent`/`on`, pg-boss, `defineJob`, воркер | фаза 1.6 | `events-automations`, `background-jobs` |
| файлы, видео | `kernel/storage/*`, `kernel/video/*` | presigned upload, `defineFilePurpose`, signed URL | фаза 1.7 | `files-media` |
| журнал, http, вебхуки | `kernel/{audit,http,webhooks}.ts` | `ctx.audit`, `ctx.http`, `defineWebhookHandler` | фаза 1.11 | `security-baseline`, `integrations` |
| документы | `kernel/documents/*` | `defineDocument`, `defineExport` | фаза 4 | `documents` |
| тест-хелперы | `test/{users,http,global-setup}.ts` | `createUser`, `uniqueEmail/Slug`, `call`, `signUp`, чистая `dinastia_test` | есть; `withTestSchool`, `callAs`, `expectPermissionMatrix` — 1.9 | `testing` |
| UI | `packages/ui` | компоненты shadcn, тема, `Field`, `PageHeader`, `EmptyState`; ресурс-фреймворк `@dinastia/ui/resource` (`defineResource`, `ResourcePage`, `ResourceTable`, `ResourceForm`, `ResourceProvider`) | есть | `ui-kit`, `admin-resource` |
| реестры блоков/вопросов | `packages/{blocks,questions}` | `defineBlock`, `defineQuestion`, хосты | фаза 1.3–1.4 | `lesson-blocks`, `question-types` |
| инструменты | `tools/src/{docs-check,skills-link}.ts`, `tools/src/gen/{markers,module,resource}.ts` | `pnpm docs:check`, `pnpm skills:link`, `pnpm gen:module`, `pnpm gen:resource` (маркеры `gen:<вид>:<место>`, разделы JSON — `jsonSection`) | есть; `gen:block/question`, `check:registries` — 1.3–1.5 | `skill-authoring`, `module`, `admin-resource` |

## Инварианты (ломать нельзя)

1. Продуктовый код не может выполнить запрос к тенантной таблице без тенанта: `app_user` без `BYPASSRLS`, политика
   `tenantTable` пускает только текущую школу, тест `rls-coverage` проверяет каждую таблицу с `school_id`, FK —
   составные (D-038);
   глобальный клиент недоступен модулям (lint `no-restricted-imports`).
2. Каждая процедура с `mw.member` объявляет `can(…)` — проверяет тест-страж (`kernel/router-guard.ts`).
3. `toPublic` убирает все `secretKeys` — проверка на `defaults()` и на примерах из тестов.
   3a. Модель реляционная (D-032): `jsonb` только через `richText()`/`opaqueJson()`; поля схем реестров = колонки их таблиц.
4. События доставляются только после коммита; подписчики и задачи — at-least-once.
5. Контракт `define*` меняется обратно совместимо; несовместимое — с миграцией всех использований в той же задаче.

## Генераторы

Общий код — `tools/src/gen/markers.ts`: `create`, `insertBefore(файл, '<вид>:<место>', строка)`, `plan` (проверить до
записи: файлов нет, маркеры есть, строки не вставлены), `apply`, затем `biome check --write`. Маркер — комментарий
`// gen:<вид>:<место>` в конце списка; совпадение имени точное. Каждый генератор проверяется в CI пробным запуском.

## Добавить новый реестр

1. Нужда подтверждена: ≥ 2 будущих однотипных расширения, иначе — обычный код.
2. `define<Name>()` с типом: ключ, zod-схема, мета для UI; если данные хранятся — своя таблица (хелпер в
   `@dinastia/db`) и сверка схемы с колонками.
3. `registry.ts` (сервер) и при необходимости `registry.client.ts`; авто-регистрация генератором.
4. Правила в `check:registries` (уникальность, инварианты контракта).
5. Генератор `tools/gen/<name>` с шаблоном, вывод которого сразу проходит `pnpm check`.
6. Скилл `docs/skills/platform/<name>/SKILL.md`, строка в `AGENTS.md`, таблица реестров в `architecture.md` §5.
7. Решение `D-NNN`.

## Готово, когда

`pnpm check` и все e2e зелёные; инварианты покрыты тестами; спека и скиллы `platform/*` описывают новое поведение;
примеры в скиллах соответствуют коду.

## Остановись и спроси, если

- изменение ломает инвариант или контракт `define*`;
- нужно заменить библиотеку из `architecture.md` §1;
- изменение затрагивает безопасность (auth, RLS, подписанные ссылки) — покажи план до правок.
