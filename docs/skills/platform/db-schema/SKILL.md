---
name: db-schema
description: Таблицы и миграции БД Dinastia — Drizzle-схема в apps/api/src/modules/<m>/schema.ts, тенантные таблицы через tenantTable() и tenantColumns() (school_id, RLS-политика, uuid v7, created_at/updated_at), типы колонок, enum, внешние ключи и onDelete, индексы с school_id первым, JSONB со схемой и версией, генерация миграции pnpm db:generate, миграции данных, что нельзя делать с миграциями. Использовать для «добавь таблицу/колонку/поле в БД», «индекс», «миграция», «enum статусов», «связь один-ко-многим».
---

# Схема БД

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.3).

Тенантность и RLS — `docs/specs/architecture.md` §3, JSONB — §6, модель данных — `docs/specs/domain.md`.

## Тенантная таблица

Всё, что принадлежит школе, — только так:

```ts
// apps/api/src/modules/courses/schema.ts
import { index, integer, jsonb, pgEnum, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenantColumns, tenantTable, fk } from '@/kernel/db'

export const courseStatus = pgEnum('course_status', ['draft', 'published', 'archived'])

export const courses = tenantTable(
  'courses',
  {
    ...tenantColumns(), // id (uuid v7), schoolId, createdAt, updatedAt
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    status: courseStatus('status').notNull().default('draft'),
    settings: jsonb('settings').$type<CourseSettings>().notNull().default({}),
  },
  (t) => [
    uniqueIndex().on(t.schoolId, t.slug),
    index().on(t.schoolId, t.status),
  ],
)

export const sections = tenantTable(
  'sections',
  {
    ...tenantColumns(),
    courseId: fk('course_id', () => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [index().on(t.schoolId, t.courseId, t.position)],
)
```

`tenantTable` = `pgTable` + `enableRLS()` + политика `school_id = current_setting('app.school_id')::uuid` для
`app_user`. Обычный `pgTable` в модулях — **только** для глобальных таблиц и только с разрешения человека.

## Правила

| Что | Как |
|---|---|
| имена | таблицы — `snake_case` во множественном числе; колонки — `snake_case` в БД, `camelCase` в TS |
| id | только из `tenantColumns()`; руками не генерировать |
| деньги | `integer` в копейках + `currency text` |
| время | `timestamp('…', { withTimezone: true })` |
| статусы | `pgEnum`; тот же список — `z.enum` в контракте (из одного массива `as const` в `packages/contracts`) |
| связи | `fk()`; `onDelete`: `cascade` для частей целого (раздел курса), `restrict` для ссылок на чужое (ученик), `set null` для необязательных |
| индексы | **`school_id` первым** в каждом составном индексе; индекс под каждый фильтр/сортировку списка и под каждый FK |
| JSONB | только для данных реестров (блоки, настройки, свои поля); тип — из zod-схемы; фильтруемое — в колонку |
| мягкое удаление | не по умолчанию; для курсов — `status: archived` |
| порядок | `position integer`, шаг 1000 |

## Миграции

1. Правка `schema.ts` → `pnpm db:generate --name <что_сделано>` → проверь SQL в `apps/api/drizzle/<NNNN>_*.sql`.
2. `pnpm db:migrate` локально; `pnpm test -- <module>` (интеграционные тесты, включая RLS).
3. **Миграция данных** (заполнить новую колонку, перенести JSON) — отдельной миграцией
   `pnpm db:generate --custom --name backfill_<что>`: SQL, идемпотентный, батчами по `school_id` для больших таблиц.
4. Меняется схема JSONB-данных реестра — не миграция БД, а новая версия `v` и миграция в реестре
   (`lesson-blocks`, `settings`).

Нельзя:
- править миграцию, которая уже в main;
- в одной миграции переименовать колонку, которую читает работающий код, — делай «добавить → заполнить → переключить
  код → удалить» (expand/contract), удаление — отдельной задачей;
- `DROP`/удаление данных без согласования с человеком.

## Готово, когда

Миграция сгенерирована и применяется на чистой БД (`pnpm db:reset`), `pnpm check` зелёный, `check:registries`
подтвердил RLS у новой таблицы (тест изоляции школ генерируется для каждой `tenantTable`).

## Остановись и спроси, если

- нужна глобальная (не тенантная) таблица;
- миграция удаляет/переименовывает колонку или таблицу с данными;
- нужно хранить персональные данные нового вида (паспорт, телефон родителя) — 152-ФЗ;
- хочется хранить в JSONB то, по чему будут фильтровать.
