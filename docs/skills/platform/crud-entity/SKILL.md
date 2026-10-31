---
name: crud-entity
description: Сквозной рецепт Dinastia — новая сущность от таблицы до экрана за один проход — таблица (db-schema) → миграция → zod-схемы и контракт list/get/create/update/remove (api-endpoints) → сервис (data-access) → роутер с can() → разрешения (permissions) → ресурс с таблицей и формой (admin-resource) → маршрут и пункт меню (web-screens) → строки (i18n) → тесты прав, изоляции и e2e (testing) → сид. Использовать для «добавь сущность/справочник/реестр X», «нужна таблица и экран для X», «CRUD для X» — особенно небольшим моделям как пошаговый маршрут.
---

# Сущность от таблицы до экрана

> Статус: сверено с кодом в 1.13 (хелперы, цепочка процедуры, генераторы, проверки). Образец сквозного пути в коде —
> «Сотрудники школы»: `packages/contracts/src/schools.ts` (`StaffListInput`, `membersContract`),
> `apps/api/src/modules/schools/members.service.ts`, `apps/web/src/features/schools/resources/staff.ts`.

Рецепт склеивает скиллы платформы в один маршрут. Пример ниже — справочник **тегов вопросов** `question_tags` модуля
`assessments` (`domain.md`: `question_tags` + связка `question_tag_links`; модуль появится в фазе 3 — в примере
это имена, а не существующие файлы). Подставь свои имена; детали каждого шага — в указанном скилле.

## 0. Вход

Модуль и имя сущности даёт человек. Есть ли сущность в `docs/specs/domain.md`? Нет — сначала `change-workflow`
(сущность — это изменение модели). Модуля ещё нет — `pnpm gen:module <имя>` (скилл `module`).

## 1. Таблица — `db-schema`

```ts
// apps/api/src/modules/assessments/schema.ts
import { tenantRef, tenantTable } from '@dinastia/db'
import { text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const questionTags = tenantTable(
	'question_tags',
	{
		courseId: uuid('course_id').notNull(),
		name: text('name').notNull(), // имя похоже на ПДн? — нет (метка вопроса): check:registries потребует NOT_PII
		color: text('color'),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), uniqueIndex().on(t.schoolId, t.courseId, t.name)],
)
```

Экспорт — в `apps/api/src/db-schema.ts` (маркер `gen:module:schema` уже есть у модуля из генератора).
`pnpm db:generate --name question_tags && pnpm db:migrate`.

## 2. Контракт — `api-endpoints`

```ts
// packages/contracts/src/assessments.ts
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Id, page, pageInput } from './common/index.ts'

export const QuestionTag = z.object({ id: Id, courseId: Id, name: z.string().trim().min(1).max(50), color: z.string().nullable() })
export const QuestionTagCreate = QuestionTag.pick({ courseId: true, name: true, color: true })
export const QuestionTagUpdate = QuestionTagCreate.omit({ courseId: true }).partial().extend({ id: Id })
export const QuestionTagListInput = pageInput({
	sorts: ['name', 'createdAt'] as const, // чужая сортировка — 400 из контракта, а не сервиса
	defaultSort: 'name',
	filters: { courseId: Id },
})

export const questionTagsContract = {
	list: oc.route({ method: 'GET', path: '/question-tags' }).input(QuestionTagListInput).output(page(QuestionTag)),
	create: oc.route({ method: 'POST', path: '/question-tags', successStatus: 201 }).input(QuestionTagCreate).output(QuestionTag),
	update: oc.route({ method: 'PATCH', path: '/question-tags/{id}' }).input(QuestionTagUpdate).output(QuestionTag),
	remove: oc.route({ method: 'DELETE', path: '/question-tags/{id}' }).input(z.object({ id: Id })).output(z.void()),
}
```

Подключение — в `packages/contracts/src/index.ts` (маркер `gen:module:entry`); новые пути попадут в OpenAPI — тест
`app.test.ts` сверяет список.

## 3. Сервис — `data-access`

```ts
// apps/api/src/modules/assessments/tags.service.ts — как listStaff в modules/schools/members.service.ts
export async function listTags(ctx: SchoolCtx, input: QuestionTagListQuery) {
	const q = listQuery(input, {
		search: [questionTags.name],
		sort: { name: questionTags.name, createdAt: questionTags.createdAt },
		tiebreak: questionTags.id,
		filters: { courseId: questionTags.courseId },
	})
	const [items, [total]] = await Promise.all([
		ctx.db.select().from(questionTags).where(q.where).orderBy(...q.orderBy).limit(q.limit).offset(q.offset),
		ctx.db.select({ n: count() }).from(questionTags).where(q.where),
	])
	return toPage(items, total?.n ?? 0, input)
}
```

`create` — дубль имени → `fail.conflict('TAG_EXISTS')`; `update`/`remove` — нет записи → `fail.notFound('TAG_NOT_FOUND')`.
Только `ctx.db` (RLS школы), `school_id` руками не пишется. Значимое действие (удаление, массовая правка) —
`await ctx.audit('assessments.tag.removed', { entity: 'question-tag', id })`.

## 4. Права и роутер — `permissions`, `api-endpoints`

Разрешения — `modules/assessments/permissions.ts` (`definePermissions`). Каждая процедура участника:

```ts
list: impl.questionTags.list
	.use(mw.host).use(mw.session).use(mw.school).use(mw.tenantTx).use(mw.member)
	.use(can('assessments.bank.read'))
	.handler(({ input, context }) => listTags(schoolCtx(context), input)),
```

Массовое или дорогое действие — ещё `.use(rateLimit({ name, max, windowSeconds, by: 'member' }))` (скилл
`security-baseline`). Тест-страж падает, если у процедуры участника нет `can()`.

## 5. Ресурс и экран — `admin-resource`, `web-screens`

`pnpm gen:resource assessments question-tags --row QuestionTag --api questionTags --perm assessments.bank.read` →
ресурс с колонками из схемы, маршрут `/admin/question-tags`, строки `assessments:question-tags.*`, запись в реестре
ресурсов (`apps/web/src/features/resources.ts`). Дальше руками: `color` — `render` функцией, форма создания
(`create`), действия; вкладка курса вместо отдельного маршрута — экран `web-screens` с `ResourcePage` внутри.

## 6. Строки — `i18n`

`packages/i18n/locales/ru/<модуль>.json` (здесь `assessments.json`, создаёт `gen:module`): `question-tags.title`, `question-tags.fields.name`, `…fields.color`;
`errors.json`: `TAG_EXISTS`, `TAG_NOT_FOUND` — `check:registries` требует текст для каждого кода из `fail.*`.
Термины — `docs/specs/glossary.md`. Пропущенная строка в разработке видна как `⟦ключ⟧`.

## 7. Тесты — `testing`

- интеграционный (`withTestSchool`, `t.as(role)`): создать, дубль → 409, список фильтруется по курсу;
- матрица прав: `expectPermissionMatrix(t, (c) => c.questionTags.list({ … }), { allow: ['owner', 'admin', 'teacher'], deny: ['curator', 'student'] })`;
- изоляция школ: RLS и политику проверяют `check:registries` и `rls-coverage.test`; в тесте сервиса — запись другой
  школы не видна (`withTestSchool` × 2);
- e2e: преподаватель создаёт тег в курсе и видит его в списке; снимок `@shots` (скилл `visual-review`).

## 8. Сид — `local-env`

2–3 тега в демо-курс — `apps/api/src/seed.ts` (идемпотентно, через сервисы; `pnpm db:seed`).

## 9. Документация

Строка сущности в `docs/specs/domain.md` §1 (если изменение модели — в рамках карточки), продуктовый скилл модуля.

## Готово, когда

`pnpm check` (с `check:registries`) и e2e зелёные; экран работает для ролей с правом и скрыт для остальных; снимки
просмотрены; `domain.md` описывает сущность.
