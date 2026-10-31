---
name: crud-entity
description: Сквозной рецепт Dinastia — новая сущность от таблицы до экрана за один проход — таблица (db-schema) → миграция → zod-схемы и контракт list/get/create/update/remove (api-endpoints) → сервис (data-access) → роутер с can() → разрешения (permissions) → ресурс с таблицей и формой (admin-resource) → маршрут и пункт меню (web-screens) → строки (i18n) → тесты прав, изоляции и e2e (testing) → сид. Использовать для «добавь сущность/справочник/реестр X», «нужна таблица и экран для X», «CRUD для X» — особенно небольшим моделям как пошаговый маршрут.
---

# Сущность от таблицы до экрана

> Статус: целевой — сверить с кодом в фазе 1 (после 1.1–1.2 рецепт проходит генераторами).

Рецепт склеивает скиллы платформы в один маршрут. Пример — справочник **тегов вопросов** `question_tags` в модуле
`assessments`. Это реальная сущность модели (`domain.md`: `question_tags` + связка `question_tag_links`). Подставь свои имена; детали каждого шага — в указанном скилле.

## 0. Вход

Модуль и имя сущности даёт человек. Есть ли сущность в `docs/specs/domain.md`? Нет — сначала `change-workflow`
(сущность — это изменение модели).

## 1. Таблица — `db-schema`

```ts
// apps/api/src/modules/assessments/schema.ts
export const questionTags = tenantTable(
	'question_tags',
	{
		courseId: uuid('course_id').notNull(),
		name: text('name').notNull(),
		color: text('color'),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), uniqueIndex().on(t.schoolId, t.courseId, t.name)],
)
```

`pnpm db:generate --name question_tags && pnpm db:migrate`

## 2. Контракт — `api-endpoints`

```ts
// packages/contracts/src/assessments.ts
export const QuestionTag = z.object({ id: Id, courseId: Id, name: z.string().trim().min(1).max(50), color: z.string().nullable() })
export const QuestionTagCreate = QuestionTag.pick({ courseId: true, name: true, color: true })
export const QuestionTagUpdate = QuestionTagCreate.omit({ courseId: true }).partial().extend({ id: Id })
export const QuestionTagListInput = PageInput.extend({ courseId: Id })

questionTags: {
  list:   oc.route({ method: 'GET',    path: '/question-tags' }).input(QuestionTagListInput).output(Page(QuestionTag)),
  get:    oc.route({ method: 'GET',    path: '/question-tags/{id}' }).input(z.object({ id: Id })).output(QuestionTag),
  create: oc.route({ method: 'POST',   path: '/question-tags' }).input(QuestionTagCreate).output(QuestionTag),
  update: oc.route({ method: 'PATCH',  path: '/question-tags/{id}' }).input(QuestionTagUpdate).output(QuestionTag),
  remove: oc.route({ method: 'DELETE', path: '/question-tags/{id}' }).input(z.object({ id: Id })).output(z.void()),
},
```

## 3. Сервис — `data-access`

`apps/api/src/modules/assessments/tags.service.ts`: `list` (через `listQuery`/`toPage`, `where courseId`), `get`
(`getOrFail`), `create` (проверка, что курс существует — `getCourse` из `courses/service`; дубль имени →
`fail.conflict('TAG_EXISTS')`), `update`, `remove`.

## 4. Права и роутер — `permissions`, `api-endpoints`

Разрешения есть (`assessments.bank.read/manage`)? Используй их; новые — в `permissions.ts`.
Роутер: каждая процедура `.use(school).use(can('…'))` → сервис.

## 5. Ресурс и экран — `admin-resource`, `web-screens`

`pnpm gen:resource assessments question-tags --row QuestionTag --api questionTags --perm assessments.bank.read` →
ресурс с колонками из схемы, маршрут `/admin/question-tags`, строки `assessments:question-tags.*`, запись в реестре
ресурсов. Дальше руками: `color` — `render` функцией, форма создания (`create`), действия; вкладка курса вместо
отдельного маршрута — экран `web-screens` с `ResourcePage` внутри.

## 6. Строки — `i18n`

`packages/i18n/locales/ru/assessments.json`: `question-tags.title`, `question-tags.fields.name`, `…fields.color`, `errors.json`:
`TAG_EXISTS`. Термины — `docs/specs/glossary.md`.

## 7. Тесты — `testing`

- интеграционный: создать, дубль → 409, список фильтруется по курсу;
- матрица прав: `bank.manage` у owner/admin/teacher, curator/student — 403;
- изоляция школ: RLS и политику проверяют `check:registries` и `rls-coverage.test`; в тесте сервиса — запись другой
  школы не видна (`withTestSchool` × 2);
- e2e: преподаватель создаёт тег в курсе и видит его в списке.

## 8. Сид — `local-env`

Добавь 2–3 тега в демо-курс (`tools/seed/`).

## 9. Документация

Строка сущности в `docs/specs/domain.md` §1 (если изменение модели — в рамках карточки), продуктовый скилл модуля.

## Готово, когда

`pnpm check` и e2e зелёные; экран работает для ролей с правом и скрыт для остальных; `domain.md` описывает сущность.
