---
name: admin-resource
description: Ресурс-фреймворк Dinastia (low-code экраны) — defineResource в apps/web/src/features/<m>/resources/*.ts описывает реестр (ResourceTable — колонки, сортировка, поиск, фильтры, пагинация, выбор строк, массовые действия) и форму (ResourceForm — поля из zod-схемы контракта, виджеты, раскладка, условная видимость, зависимые поля) с действиями и правами; страница ResourcePage, серверная сторона paginate/applyFilters; генератор pnpm gen:resource. Использовать для «экран со списком», «реестр», «таблица», «форма редактирования», «фильтр», «колонка», «справочник» — аналог форм и настроек таблиц GaskarFM.
---

# Админ-ресурс

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.2).

Ресурс — описание CRUD-экрана сущности. Из него строятся таблица, фильтры, форма создания/редактирования и действия.
Для **продуктовых** экранов (конструктор урока, плеер, проверка ДЗ) ресурс не нужен — скилл `web-screens`.

## Описание

```ts
// apps/web/src/features/courses/resources/courses.ts
import { defineResource, col, filter, action } from '@dinastia/ui/resource'
import { Course, CourseCreate, CourseUpdate, COURSE_STATUSES } from '@dinastia/contracts/courses'
import { orpc } from '#/app/orpc'

export const coursesResource = defineResource({
	key: 'courses',
	i18n: 'courses', // namespace: заголовки колонок/полей = courses:fields.<поле>
	row: Course,
	api: {
		list: orpc.courses.list,
		get: orpc.courses.get,
		create: orpc.courses.create,
		update: orpc.courses.update,
	},
	perms: { read: 'courses.read', write: 'courses.manage' },

	columns: [
		col('title', { link: (r) => `/admin/courses/${r.id}`, sortable: true }),
		col('status', { render: 'badge', options: COURSE_STATUSES }),
		col('createdAt', { render: 'date', sortable: true }),
	],
	search: true, // строка поиска → input.search
	filters: [filter('status', { type: 'select', options: COURSE_STATUSES })],
	defaultSort: { createdAt: 'desc' },

	form: {
		create: CourseCreate,
		update: CourseUpdate,
		fields: {
			description: { widget: 'richtext' },
			coverFileId: { widget: 'image', purpose: 'course-cover' },
		},
		layout: [['title'], ['description'], ['coverFileId']],
		mode: 'sheet', // sheet | dialog | page
	},

	actions: [
		action('publish', {
			perm: 'courses.publish',
			visible: (r) => r.status === 'draft',
			confirm: true,
			run: (r) => orpc.courses.publish.call({ id: r.id }),
		}),
	],
})
```

Маршрут:

```tsx
// apps/web/src/routes/admin/courses/index.tsx
export const Route = createFileRoute('/admin/courses/')({
	beforeLoad: requirePerm('courses.read'),
	component: () => <ResourcePage resource={coursesResource} />,
})
```

## Справочник

| Часть                          | Варианты                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `col.render`                   | `text` (по умолчанию), `badge`, `date`, `datetime`, `number`, `money`, `bool`, `avatar`, `user`, `progress`, `custom` (функция-компонент)                                                             |
| `filter.type`                  | `select`, `multiselect`, `date-range`, `bool`, `ref` (выбор записи другого ресурса: `ref: 'groups'`)                                                                                                  |
| `form.fields.<поле>.widget`    | по типу zod автоматически: string→`input`, enum→`select`, boolean→`switch`, number→`number`, date→`date`; явно: `textarea`, `richtext`, `image`, `file`, `ref`, `multiref`, `color`, `slug`, `custom` |
| `form.fields.<поле>.visibleIf` | `(values) => boolean` — аналог `visibleIf` GaskarFM                                                                                                                                                   |
| `form.fields.<поле>.dependsOn` | список полей; при изменении — пересчёт опций (`options: (values) => …`)                                                                                                                               |
| `action`                       | на строке, в массовых (`bulk: true`), в шапке (`scope: 'page'`); `run` → после успеха список инвалидируется                                                                                           |

Полный список опций — типы `ResourceDef` в `packages/ui/src/resource/types.ts`; используй только существующие.
Не хватает опции — запрос к ядру, не самописная таблица рядом.

## Сервер

Фильтры приходят как `input.filters: { status: 'draft' }`; сервис передаёт их в `paginate()` с разрешённым списком
`filters: { status: courses.status }` (скилл `data-access`). Фильтр, которого нет в сервисе, — 400.

## Шаги

1. Контракт сущности есть (`list`, `get`, `create`, `update`) — скилл `api-endpoints`.
2. `pnpm gen:resource <module> <entity>` — заготовка ресурса, маршрут, строки i18n.
3. Колонки, фильтры, поля, действия; строки — в `packages/i18n/locales/ru/<module>.json`.
4. Пункт меню в `features/<m>/nav.ts` (скилл `web-screens`).
5. `pnpm check`; e2e: открыть список, создать, отфильтровать (скилл `testing`).

## Остановись и спроси, если

- нужен виджет или тип колонки, которого нет в `types.ts`;
- экран не укладывается в «список + форма» — это продуктовый экран (`web-screens`).
