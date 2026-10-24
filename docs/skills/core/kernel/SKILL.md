---
name: core-kernel
description: Устройство и доработка ядра Dinastia (только с разрешения человека или в задачах фаз 0–1) — apps/api/src/kernel (db и роли Postgres, tenantTable и RLS, withTenant и forEachSchool, better-auth и резолв школы по хосту, базовые процедуры oRPC pub/authed/school и can, контекст запроса, permissions, events с outbox, jobs на pg-boss, storage S3, mail, documents, settings, config, errors fail), packages/ui/resource, механика реестров define* и как добавить новый реестр (тип, registry, check:registries, генератор, скилл), генераторы tools/gen, правила изменения контрактов ядра. Использовать для задач «доработай ядро», «новый хелпер», «новый реестр», «генератор», «почини RLS/auth».
---

# Ядро

> Статус: целевой — сверить с кодом в фазах 0–1; после этого скилл описывает фактическое устройство.

Ядро меняется **только** с явного разрешения человека в задаче или в задаче фаз 0–1 (`AGENTS.md`). Архитектура —
`docs/specs/architecture.md`; изменение, которое меняет поведение для модулей, — правка этой спеки и затронутых
скиллов `platform/*` в той же задаче.

## Карта

| Часть                   | Файл                                                                                                                                              | Отвечает за                                                                                                             | Скилл использования                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| хелперы схемы           | `packages/db` (`@dinastia/db`)                                                                                                                    | `schools`, `tenantTable`, `tenantRef`, `blockTable`, `blockChildTable`, `settingsTable`, `richText`, `opaqueJson`, `pii`, `fk` | `db-schema`, `lesson-blocks`, `settings` |
| БД                      | `kernel/db/{client,tenant,paginate,errors}.ts`                                                                                                    | пул, роли, `paginate`, `applyFilters`, `fail`                                                                           | `data-access`                            |
| Тенант                  | `kernel/tenant.ts`                                                                                                                                | `withTenant(schoolId, fn)` — транзакция + `set_config`, `forEachSchool`                                                 | `data-access`                            |
| Auth | `kernel/auth/{auth,schema}.ts`, `kernel/host.ts` | better-auth (пользователи, сессии, пароль, magic link, rate limit в БД, origin-check явно — D-040), согласия, резолв школы по хосту; школы, участники, приглашения — модуль `schools` (D-007) | `lms-school`, `security-baseline` |
| oRPC                    | `kernel/orpc.ts`, `kernel/context.ts`                                                                                                             | `impl` (implementer контракта), middleware `pub`/`authed`/`school`/`can`, сборка контекста, маппинг ошибок, OpenAPI     | `api-endpoints`                          |
| Права                   | `kernel/permissions.ts`                                                                                                                           | `definePermissions`, тип `Permission`, `can`, роли                                                                      | `permissions`                            |
| Модули                  | `kernel/module.ts`                                                                                                                                | `defineModule`, сборка роутера, подписчиков, задач, настроек                                                            | `module`                                 |
| События                 | `kernel/events/*`                                                                                                                                 | `defineEvent`, `on`, outbox-таблица, диспетчер после коммита                                                            | `events-automations`                     |
| Задачи                  | `kernel/jobs/*`                                                                                                                                   | pg-boss, `defineJob`, расписания, `scope: all-schools`, воркер                                                          | `background-jobs`                        |
| Файлы, видео            | `kernel/storage/*`, `kernel/video/*`                                                                                                              | presigned upload, `defineFilePurpose`, signed URL, провайдеры видео                                                     | `files-media`                            |
| Почта                   | `kernel/mail/*`                                                                                                                                   | `defineEmail`, транспорт провайдера, фейк для тестов                                                                    | `notifications`                          |
| Документы               | `kernel/documents/*`                                                                                                                              | `defineDocument`, `defineExport`, Chromium-рендер                                                                       | `documents`                              |
| Настройки, конфиг       | `kernel/settings.ts`, `kernel/config.ts`                                                                                                          | `defineSettings`, env-схема                                                                                             | `settings`                               |
| Тест-хелперы            | `apps/api/src/test/*`                                                                                                                             | `withTestSchool`, `callAs`, матрица прав, часы, фейки                                                                   | `testing`                                |
| Ресурсы UI              | `packages/ui/src/resource/*`                                                                                                                      | `defineResource`, `ResourcePage/Table/Form`, виджеты                                                                    | `admin-resource`                         |
| Реестры блоков/вопросов | `packages/{blocks,questions}/src/{define,registry,registry.client,tables,host}.ts(x)`, `kernel/blocks/*` (load/save/copy по таблицам, публикация) | контракт, сопоставление схемы и колонок, хосты редактора/просмотра                                                      | `lesson-blocks`, `question-types`        |
| Генераторы и проверки   | `tools/gen/*`, `tools/check/*`                                                                                                                    | `gen:*`, `check:registries`, `docs:check`, `skills:link`                                                                | —                                        |

## Инварианты (ломать нельзя)

1. Продуктовый код не может выполнить запрос к тенантной таблице без тенанта: `app_user` без `BYPASSRLS`, политика
   `tenantTable` пускает только текущую школу, тест `rls-coverage` проверяет каждую таблицу с `school_id`, FK —
   составные (D-038);
   глобальный клиент недоступен модулям (lint `no-restricted-imports`).
2. Каждая процедура `school` требует `can()` — `check:registries` проверяет.
3. `toPublic` убирает все `secretKeys` — проверка на `defaults()` и на примерах из тестов.
   3a. Модель реляционная (D-032): `jsonb` только через `richText()`/`opaqueJson()`; поля схем реестров = колонки их таблиц.
4. События доставляются только после коммита; подписчики и задачи — at-least-once.
5. Контракт `define*` меняется обратно совместимо; несовместимое — с миграцией всех использований в той же задаче.

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
