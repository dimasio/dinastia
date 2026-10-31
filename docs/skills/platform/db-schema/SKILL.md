---
name: db-schema
description: Таблицы и миграции БД Dinastia (только реляционная модель, D-032) — Drizzle-схема в apps/api/src/modules/<m>/schema.ts, хелперы @dinastia/db — тенантные таблицы tenantTable() (сам добавляет id uuidv7(), school_id из контекста, created_at/updated_at, RLS-политику) и составные внешние ключи tenantRef(), richText() для тела форматированного текста, opaqueJson() только для непрозрачных данных, pii() (с 1.11); типы колонок, enum, внешние ключи и onDelete, связи многие-ко-многим через таблицу-связку, списки — дочерними таблицами с position, индексы с school_id первым, генерация миграции pnpm db:generate, миграции данных, что нельзя делать с миграциями. Использовать для «добавь таблицу/колонку/поле в БД», «индекс», «миграция», «enum статусов», «связь один-ко-многим».
---

# Схема БД

> Статус: сверено с кодом в фазе 0 (0.3–0.4), `pii()` — в 1.11, `blockTable`/`blockChildTable`/`settingsTable` — в 1.3.

Тенантность и RLS — `docs/specs/architecture.md` §3, реляционная модель и где допустим JSONB — §6 (D-032), модель
данных — `docs/specs/domain.md`.

## Тенантная таблица

Всё, что принадлежит школе, — только так (пример проверен компиляцией на реальных хелперах):

```ts
// apps/api/src/modules/courses/schema.ts
import { richText, tenantRef, tenantTable } from '@dinastia/db'
import { index, integer, pgEnum, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const courseStatus = pgEnum('course_status', ['draft', 'published', 'archived'])
export const accessMode = pgEnum('access_mode', ['open', 'sequential', 'drip'])

// id (uuidv7()), school_id (из контекста), created_at, updated_at, RLS и политика — добавляет tenantTable
export const courses = tenantTable(
	'courses',
	{
		title: text('title').notNull(),
		slug: text('slug').notNull(),
		description: richText('description'), // тело rich text — единственный «документ» в строке
		status: courseStatus('status').notNull().default('draft'),
		defaultAccessMode: accessMode('default_access_mode').notNull().default('sequential'),
		accessDays: integer('access_days'), // null — бессрочно
	},
	(t) => [uniqueIndex().on(t.schoolId, t.slug), index().on(t.schoolId, t.status)],
)

export const sections = tenantTable(
	'sections',
	{
		courseId: uuid('course_id').notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull(),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), index().on(t.schoolId, t.courseId, t.position)],
)
```

`tenantTable` (`packages/db/src/tenant.ts`) сам добавляет:

| Что | Как |
|---|---|
| `id` | `uuid primary key default uuidv7()` |
| `school_id` | `not null default nullif(current_setting('app.school_id', true), '')::uuid` + FK на `schools` (cascade) — **руками не пишется** |
| `created_at`, `updated_at` | `timestamptz default now()`; `updated_at` обновляет Drizzle |
| RLS | `enable row level security` + политика `<таблица>_tenant_isolation` для `app_user`: чтение и запись только при `school_id = текущая школа` |
| `unique (school_id, id)` | цель составных внешних ключей |

Связь между тенантными таблицами — **только** `tenantRef(t, t.<колонка>, <таблица>, onDelete)`: составной FK
`(school_id, <колонка>) → (school_id, id)` (D-038). Обычный `.references()` на тенантную таблицу пропустил бы ссылку на
запись другой школы. `onDelete: 'set null'` для составного FK не поддерживается — необязательная связь делается
`restrict`/`no action` и обнуляется сервисом.

Обычный `pgTable` в модулях — **только** для глобальных таблиц и только с разрешения человека.

## Правила

| Что             | Как                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| имена           | таблицы — `snake_case` во множественном числе; колонки — `snake_case` в БД, `camelCase` в TS                                                                                                                                      |
| id              | только от `tenantTable` (`uuidv7()`); руками не генерировать                                                                                                                                                                               |
| деньги          | `integer` в копейках + `currency text`                                                                                                                                                                                            |
| время           | `timestamp('…', { withTimezone: true })`                                                                                                                                                                                          |
| статусы         | `pgEnum`; тот же список — `z.enum` в контракте (из одного массива `as const` в `packages/contracts`)                                                                                                                              |
| связи | между тенантными таблицами — только `tenantRef()` (составной FK, D-038), `onDelete`: `cascade` для частей целого (раздел курса), `restrict` для ссылок на чужое (ученик), `no action` для необязательных (обнуляет сервис); на глобальные таблицы (`users`, `schools`) — обычный `.references()`, там `set null` можно |
| индексы         | **`school_id` первым** в каждом составном индексе; индекс под каждый фильтр/сортировку списка и под каждый FK                                                                                                                     |
| структура       | **только таблицы и колонки** (D-032): список внутри сущности — дочерняя таблица с `position`; многие-ко-многим — таблица-связка `<a>_<b>_links` с уникальным индексом; варианты по типу — таблица на тип 1:1 (как `block_<type>`) |
| JSONB | только `richText()` (тело Tiptap) и `opaqueJson()` (diff журнала, payload вебхуков); голый `jsonb()` в модулях запрещён (проверяет `check:registries` по метке хелпера) |
| ПДн | колонка с данными о человеке — `pii(text('phone'))` из `@dinastia/db` (скилл `personal-data`); ключ колонки — в `SECRET_KEYS` логгера (иначе падает `kernel/pii.test.ts`) |
| неизменяемые | таблица только для добавления (журнал) — `REVOKE UPDATE, DELETE, TRUNCATE ON "<t>" FROM "app_user"` в конце сгенерированной миграции (пример — `0003_audit_webhooks.sql`) |
| массивы         | `text[]` и т.п. — нельзя для связей и справочных значений (теги — таблица); допустимо для неструктурных списков без поиска только с согласия                                                                                      |
| EAV             | ключ-значение «на все случаи» (`entity, key, value`) — нельзя; свои поля (R3) — отдельное решение                                                                                                                                 |
| мягкое удаление | не по умолчанию; для курсов — `status: archived`                                                                                                                                                                                  |
| порядок         | `position integer`, шаг 1000                                                                                                                                                                                                      |

## Миграции

1. Правка `schema.ts` → `pnpm db:generate --name <что_сделано>` → проверь SQL в `apps/api/drizzle/<NNNN>_*.sql`.
2. `pnpm db:migrate` локально; `pnpm test -- <module>` (интеграционные тесты, включая RLS).
3. **Миграция данных** (заполнить новую колонку, перенести JSON) — отдельной миграцией
   `pnpm db:generate --custom --name backfill_<что>`: SQL, идемпотентный, батчами по `school_id` для больших таблиц.
4. Таблицы типов блоков (`packages/blocks/src/<type>/table.ts`) и настроек модулей — такие же таблицы: изменение =
   миграция по этим же правилам (для блоков — данные и `draft`, и `published` строк).

## Особые таблицы (хелперы `@dinastia/db`)

| Хелпер | Таблица | Что добавляет сам |
| --- | --- | --- |
| `blockTable('<type>', cols)` | `block_<type>` — данные типа блока (скилл `lesson-blocks`) | PK `block_id`, `school_id`, составной FK на `lesson_blocks` с каскадом, `unique (school_id, block_id)`, RLS |
| `blockChildTable(parent, '<часть>', cols)` | `block_<type>_<часть>` — список внутри блока | `id`, `school_id`, `block_id` (FK на таблицу типа, каскад), `position`, `item_key` (стабилен между черновиком и публикацией), индекс, RLS |
| `settingsTable('<модуль>_settings', cols)` | настройки модуля, строка на школу (скилл `settings`) | PK `school_id` (FK на школу, каскад), `updated_at`, RLS; каждая колонка — с default |

`lessonBlocks` (`lesson_blocks`), `questions` и `question_items` — таблицы ядра в `@dinastia/db`; модули их не правят
напрямую, а пользуются функциями `kernel/blocks` и `kernel/questions`. Ссылка на себя (ревизия `revision_of`) —
`tenantRef(t, t.revisionOf, t, 'no action')`: `restrict` проверяется сразу и ломает каскадное удаление школы.

Нельзя:
- править миграцию, которая уже в main;
- в одной миграции переименовать колонку, которую читает работающий код, — делай «добавить → заполнить → переключить
  код → удалить» (expand/contract), удаление — отдельной задачей;
- `DROP`/удаление данных без согласования с человеком.

## Готово, когда

Миграция сгенерирована и применяется на чистой БД (`pnpm db:reset`), `pnpm check` зелёный. Тест
`apps/api/src/kernel/db/rls-coverage.test.ts` автоматически проверяет **каждую** таблицу с `school_id` после всех
миграций: RLS включён и есть политика. Глобальная таблица со ссылкой `school_id` (как `consents`) — только с
согласия человека и строкой в `GLOBAL_TABLES_WITH_SCHOOL_REF` с причиной.

Образцы: `packages/db/src/tenant.ts` (хелперы), `apps/api/src/kernel/members/schema.ts` (тенантная таблица с
дополнительной политикой), `apps/api/src/modules/schools/schema.ts` (составной FK, частичный уникальный индекс),
тесты изоляции — `apps/api/src/kernel/db/tenant.test.ts`.

## Остановись и спроси, если

- нужна глобальная (не тенантная) таблица;
- миграция удаляет/переименовывает колонку или таблицу с данными;
- нужно хранить персональные данные нового вида (паспорт, телефон родителя) — 152-ФЗ;
- хочется хранить структуру в JSON, массиве или «ключ-значение» — нельзя (D-032), предложи таблицы.
