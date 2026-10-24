---
name: data-access
description: Код доступа к данным и бизнес-логика в Dinastia — сервисные функции service.ts от контекста (ctx.db — транзакция с тенантом, ctx.user, ctx.member, ctx.emit, ctx.jobs), выборки Drizzle (select, relational query, join), пагинация paginate и фильтры applyFilters, создание/обновление/удаление, транзакции и блокировки, вызов сервиса другого модуля, N+1, ошибки fail.*, что нельзя (глобальный db, school_id руками). Использовать для «напиши логику», «выборка», «посчитай», «обнови статус», «сервис», «запрос к БД».
---

# Доступ к данным

> Статус: целевой — сверить с кодом в фазе 0 (0.3, 0.5) и 1 (1.2).

Контекст запроса — `docs/specs/architecture.md` §4.

## Сервисная функция

Бизнес-логика — в `service.ts` модуля: функция `(ctx, input) → результат`. Роутер только вызывает её; так её
переиспользуют задачи, подписчики и другие модули.

```ts
// apps/api/src/modules/courses/service.ts
import { and, eq, sql } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context'
import { fail } from '#/kernel/errors.ts'
import { paginate } from '#/kernel/db/paginate.ts' // фаза 1.2
import type { CourseCreate, CourseListInput } from '@dinastia/contracts/courses'
import { courses, lessons } from './schema'
import { coursePublished } from './events'

export async function list(ctx: SchoolCtx, input: CourseListInput) {
	return paginate(ctx.db, courses, input, {
		where: input.status ? eq(courses.status, input.status) : undefined,
		search: [courses.title],
		sort: { title: courses.title, createdAt: courses.createdAt },
		defaultSort: { createdAt: 'desc' },
	})
}

export async function create(ctx: SchoolCtx, input: CourseCreate) {
	const [row] = await ctx.db
		.insert(courses)
		.values({ ...input, slug: await uniqueSlug(ctx, input.title) })
		.returning()
	return row
}

export async function publish(ctx: SchoolCtx, id: string) {
	const course = await getOrFail(ctx, id)
	if (course.status === 'archived') fail.conflict('COURSE_ARCHIVED')
	const [row] = await ctx.db.update(courses).set({ status: 'published' }).where(eq(courses.id, id)).returning()
	ctx.emit(coursePublished, { courseId: id })
	return row
}

export async function getOrFail(ctx: SchoolCtx, id: string) {
	return (await ctx.db.query.courses.findFirst({ where: eq(courses.id, id) })) ?? fail.notFound('COURSE')
}
```

## Правила

- **Только `ctx.db`.** Это транзакция с установленным `app.school_id`; глобальный клиент `#/kernel/db/client` в
  модулях запрещён (lint-правило). `school_id` в `where`/`values` не пишется — его ставят RLS и default.
- **Один запрос — одна транзакция.** Вся процедура уже в транзакции; вложенная — `ctx.db.transaction()` (savepoint),
  только если нужна частичная откатываемость.
- **Конкуренция**: счётчики и лимиты (попытки теста, номер сертификата) — `select … for update` (`.for('update')`)
  или атомарный `update … set x = x + 1 returning`.
- **N+1**: списки с вложенными данными — relational query (`with: {...}`) или один `inArray()`-запрос и группировка
  в памяти; запрос в цикле по строкам запрещён.
- **Другой модуль** — импорт функции из его `service.ts` (`import { getOrFail as getCourse } from '../courses/service'`);
  его таблицы напрямую не трогать.
- **События** — `ctx.emit(event, data)`; доставляются после коммита. **Задачи** — `ctx.jobs.send(job, data)` в той же
  транзакции.
- **Ошибки** — `fail.notFound(code)`, `fail.conflict(code)`, `fail.forbidden(code)`, `fail.invalid(code, data)` из
  `#/kernel/errors.ts` (как они превращаются в ответ API — скилл `api-endpoints` §3);
  `code` — `UPPER_SNAKE`, в i18n есть `errors:<code>`. Не бросать `Error` с текстом для пользователя.
- **Время** — `ctx.now()` (в тестах подменяется), не `new Date()`.
- **Права** проверяет процедура (`permissions`); ограничение «куратор видит только свои группы» — функция политики
  модуля (`policies.ts`), которую сервис добавляет в `where`.

## Пагинация и фильтры

Вход списков — `PageInput` из `@dinastia/contracts/common`: `{ page, pageSize ≤ 100, sort?, search?, filters? }`;
выход — `Page<T>`: `{ items, total, page, pageSize }`. `paginate()` применяет поиск (`ilike` по колонкам `search`),
разрешённые сортировки (неизвестная — 400), фильтры ресурса (`applyFilters`, скилл `admin-resource`).

## Готово, когда

Сервис покрыт интеграционным тестом на реальной БД (скилл `testing`), `pnpm check` зелёный.

## Остановись и спроси, если

- нужен запрос по всем школам (это `forEachSchool` в задаче — скилл `background-jobs`, не в запросе пользователя);
- нужен сырой SQL сложнее одного `sql\`\``-фрагмента — покажи запрос человеку;
- нужна запись в таблицы другого модуля.
