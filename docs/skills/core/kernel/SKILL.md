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
| хелперы схемы | `packages/db` (`@dinastia/db`) | `schools`, `tenantTable`, `tenantRef`, `currentSchoolId`, `richText`, `opaqueJson`, `pii`/`isPii`, `appUser`, `lessonBlocks`, `questions`, `questionItems`, `blockTable`, `blockChildTable`, `settingsTable`, `tenantIsolation` | есть | `db-schema` |
| БД | `kernel/db/{client,tenant,admin,cli,rls-coverage,listing}.ts` | пул `app_user`, `withTenant`, `withUser`, миграции/reset под `app_owner`, проверка покрытия RLS, списки `listQuery`/`toPage` | есть; `forEachSchool` — 1.6 | `data-access` |
| конфиг | `kernel/config.ts` | zod-схема env, `.env` локально, `appOrigin()` | есть | `settings` |
| ошибки | `kernel/errors.ts` | `AppError`, `fail.*` | есть | `data-access` |
| auth | `kernel/auth/{auth,schema}.ts`, `kernel/host.ts`, `kernel/client-ip.ts` | better-auth (пароль, magic link, rate limit в БД, origin-check явно — D-040, IP — D-042), согласия, школа по хосту | есть | `lms-school`, `security-baseline` |
| членство | `kernel/members/{schema,members}.ts` | `members` (RLS + «свои членства» только вне школы), `findActiveMember` | есть | `lms-school`, `permissions` |
| oRPC | `kernel/orpc.ts`, `kernel/context.ts`, `router.ts`, `app.ts` | `impl` + `errorsMw`, `mw.host/session/school/tenantTx/member`, `schoolCtx`, входы `/api/rpc`, `/api/v1`, `/api/openapi.json` | есть | `api-endpoints` |
| права | `kernel/permissions.ts`, `kernel/router-guard.ts`, `permissions.ts` | `definePermissions`, `mergePermissions`, `createCan`, страж «у процедуры участника есть can()» | есть | `permissions` |
| логи, health | `kernel/log.ts`, `app.ts` | pino с маскированием ПДн, `ctx.log`, `x-request-id`, `/health/live|ready` | есть | `observability` |
| почта | `kernel/mail/{define.tsx,send.ts,transport.ts}` | `defineEmail`, `EmailLayout`, `renderEmail` (react-email 6), `ctx.mail.send` → задача `mail.send`, `deliverEmail` (внутри задачи), `sendMail` (SMTP / memory); `pnpm emails:preview` | есть; magic link — синхронно в auth | `notifications` |
| модули | `kernel/module.ts`, `modules/index.ts` | `defineModule` (router, permissions, jobs, subscribers), `collectRouters`, `collectJobs` → `kernel/registry.ts`; генератор `pnpm gen:module` (`tools/src/gen/`, вставка у маркеров `gen:`) | есть; настройки в модуле — 1.8+ | `module` |
| события, задачи | `kernel/{events,jobs,boss,registry,tenant-ctx,worker-runtime}.ts`, `src/worker.ts`, `src/jobs-cli.ts` | `defineEvent`/`on`/`ctx.emit` (outbox = задачи pg-boss, D-045), `defineJob`/`ctx.jobs.send` (scope `school` / `all-schools` / `global` — только ядро), `forEachSchool`, `BaseCtx`, воркер, `pnpm jobs:list|run` | есть | `events-automations`, `background-jobs` |
| файлы, видео | `kernel/storage/{schema,s3,files,router,module}.ts`, `kernel/video/*` | таблица `files`, `defineFilePurpose`, presigned upload (`files.createUpload/complete`), `ctx.files` (signedUrl, get, remove), `signFileKey`, задачи `files.delete-object`, `files.cleanup-pending`; модуль ядра `files` в реестре модулей | файлы — есть; видео — с блоком video | `files-media` |
| rate limit | `kernel/rate-limit/{schema,rate-limit}.ts` | `rateLimit({ name, max, windowSeconds, by })` (middleware oRPC), таблица `request_limits`, задача `rate-limit.cleanup` (scope `global`) | есть | `security-baseline` |
| журнал, http, вебхуки, встраивания | `kernel/audit/{schema,audit}.ts`, `kernel/http.ts`, `kernel/webhooks/{schema,define,receive}.ts`, `kernel/webhooks/providers/*`, `kernel/embed-allowlist.ts` | `ctx.audit` (`audit_log`, без UPDATE/DELETE у `app_user`), `ctx.http` (`createHttp`: проверка адреса при соединении, редиректы, таймаут, повторы), `defineWebhookProvider`/`defineWebhookHandler` → `defineModule({ webhooks })`, маршрут `POST /api/webhooks/<provider>/<schoolId>`, `webhook_events`, задача `webhooks.process`, фейк `fake`; `embedService`/`isAllowedEmbed` | есть | `security-baseline`, `integrations` |
| rich text | `packages/contracts/src/common/rich-text.ts`, `packages/contracts/src/rich-text/server.ts`, `packages/ui/src/rich-text/*` | профили, `richTextSchema`/`RichText`, `sanitizeRichText`, `toPlainText`, `toHtml`; `RichTextEditor` (Tiptap 3, лениво), `RichTextView`, виджет ресурса `richtext` | есть | `rich-text` |
| документы | `kernel/documents/*` | `defineDocument`, `defineExport` | фаза 4 | `documents` |
| тест-хелперы | `test/{users,http,global-setup}.ts` | `createUser`, `uniqueEmail/Slug`, `call`, `signUp`, чистая `dinastia_test` | есть; `withTestSchool`, `callAs`, `expectPermissionMatrix` — 1.9 | `testing` |
| UI | `packages/ui` | компоненты shadcn, тема, `Field`, `PageHeader`, `EmptyState`; ресурс-фреймворк `@dinastia/ui/resource` (`defineResource`, `ResourcePage`, `ResourceTable`, `ResourceForm`, `ResourceProvider`) | есть | `ui-kit`, `admin-resource` |
| блоки уроков | `packages/blocks` (`.`, `/server`, `/tables`, `/client`), `kernel/blocks/blocks.ts`, `tools/src/gen/block.ts` | `defineBlock`, `defineBlockStorage`, `blockStorageIssues`; хранение и публикация: `createBlock`/`updateBlock`/`removeBlock`/`reorderBlocks`/`listBlocks`/`publishBlocks`/`listPublicBlocks`; `BlockEditorHost`/`BlockViewerHost`/`BlockPalette`; `pnpm gen:block` | есть | `lesson-blocks` |
| вопросы | `packages/questions` (`.`, `/client`), `kernel/questions/questions.ts`, `tools/src/gen/question.ts` | `defineQuestion`, `questionDefIssues`; банк: `createQuestion`/`getQuestion(s)`/`listQuestions`/`updateQuestion`/`reviseQuestion`/`archiveQuestion`, `publicQuestion`/`reviewQuestion`/`gradeAnswer`; `QuestionEditorHost`/`QuestionViewerHost`; `pnpm gen:question` | есть | `question-types` |
| инструменты | `tools/src/{docs-check,skills-link}.ts`, `tools/src/gen/{markers,module,resource,block,question}.ts` | `pnpm docs:check`, `pnpm skills:link`, `pnpm gen:module`, `pnpm gen:resource`, `pnpm gen:block`, `pnpm gen:question`, `pnpm check:registries` (`apps/api/src/check-registries.ts`; маркеры `gen:<вид>:<место>`, разделы JSON — `jsonSection`) | есть; `check:registries` — 1.3–1.5 | `skill-authoring`, `module`, `admin-resource` |

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

## check:registries

`pnpm check:registries` (`apps/api/src/check-registries.ts`, правила — `apps/api/src/kernel/registry-check.ts`,
тест — `registry-check.test.ts`) входит в `pnpm check`. Код возврата 1 и список «где — что не так»:

| Раздел | Что проверяет |
| --- | --- |
| `registry` | реестры собираются: модули (`collectRouters`, дубли задач, писем, назначений файлов, вебхуков), `define*` блоков и вопросов — ошибка объявления попадает в отчёт, а не роняет проверку |
| `tables` | `jsonb` — только `richText()`/`opaqueJson()` (метка колонки, D-032); у таблицы с `school_id` — `enableRLS` и политика (исключения — `GLOBAL_TABLES_WITH_SCHOOL_REF` в `kernel/db/rls-coverage.ts`); колонка с именем `email\|phone\|name\|address\|birth` — `pii()` или запись в `NOT_PII` с причиной |
| `blocks` | ключ реестра = `type`; поля схемы = колонки (`blockStorageIssues`); в `example()` есть каждый секрет, а `toPublic` его убирает; строки `blocks:<type>.title\|description` |
| `questions` | ключ = `type`; `questionDefIssues` (общие поля, `uses`, поля элементов); `grade` или `manual`; секреты на `example()`; строки `questions:<type>.title\|description` |
| `errors` | каждый код из `fail.*('…')`, `code:`/`message:` и последнего аргумента `.refine/.regex/…` в `apps/api/src` и `packages/contracts/src` есть в `errors.json` (иначе человек увидит «Не удалось выполнить действие»); коды не для интерфейса — `NOT_UI_ERROR_CODES` с причиной |

Изоляцию школ на уровне БД проверяют тесты: `kernel/db/rls-coverage.test.ts` (после всех миграций у каждой таблицы с
`school_id` — RLS и политика) и `kernel/db/tenant.test.ts` (сама политика `tenantIsolation` и составные ключи).
Все политики строятся одним хелпером, поэтому отдельный тест на каждую таблицу не генерируется.

Новое правило: функция в `registry-check.ts` (данные — параметрами), вызов в `check-registries.ts`, тест на
намеренно сломанном примере в `registry-check.test.ts`.

## Добавить новый реестр

1. Нужда подтверждена: ≥ 2 будущих однотипных расширения, иначе — обычный код.
2. `define<Name>()` с типом: ключ, zod-схема, мета для UI; если данные хранятся — своя таблица (хелпер в
   `@dinastia/db`) и сверка схемы с колонками.
3. `registry.ts` (сервер) и при необходимости `registry.client.ts`; авто-регистрация генератором.
4. Правила в `check:registries` (раздел выше): ключ = тип, сверка схемы с хранением, секреты, строки.
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
