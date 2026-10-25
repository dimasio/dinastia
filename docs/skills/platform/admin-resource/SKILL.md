---
name: admin-resource
description: Ресурс-фреймворк Dinastia (low-code экраны) — defineResource в apps/web/src/features/<m>/resources/*.ts описывает экран-реестр (ResourceTable на TanStack Table 9 — колонки, серверные сортировка, поиск, фильтры, страницы; меню действий строки) и формы (ResourceForm — поля из zod-схемы контракта, переопределения, layout, visibleIf) с действиями и правами; ResourcePage с состоянием в адресе (resourceSearch), ResourceProvider в лэйауте, строки <ns>:<key>.*, реестр features/resources.ts и тест строк; серверная сторона pageInput/listQuery/toPage; генератор pnpm gen:resource. Использовать для «экран со списком», «реестр», «таблица», «форма редактирования», «фильтр», «колонка», «справочник» — аналог форм и настроек таблиц GaskarFM.
---

# Админ-ресурс

> Статус: сверено с кодом в фазе 1 (пункт 1.2). Образец — «Сотрудники школы»
> (`apps/web/src/features/schools/resources/staff.ts`, `/admin/staff`).

Ресурс — описание CRUD-экрана сущности. Из него строятся таблица, поиск, фильтры, страницы, форма создания и действия
над строками. Для **продуктовых** экранов (конструктор урока, плеер, проверка ДЗ) ресурс не нужен — скилл `web-screens`.

## Описание

```ts
// apps/web/src/features/schools/resources/staff.ts
import { MEMBER_STATUSES, STAFF_ROLES, StaffInvite, StaffInviteRole, StaffMember } from '@dinastia/contracts/schools'
import { action, defineResource } from '@dinastia/ui/resource'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

export const staffResource = defineResource({
	key: 'staff', // ключ кэша, data-testid, раздел строк schools:staff.*
	ns: 'schools', // namespace строк = модуль
	row: StaffMember, // zod-схема строки из контракта → тип строки
	list: client.members.list, // процедура списка: её вход задаёт допустимые sort и filters
	perms: { read: 'schools.members.read', write: 'schools.members.manage' },
	columns: [
		{ field: 'name', sort: 'name' }, // sort — ключ из sorts контракта; без него колонка не сортируется
		{ field: 'email' },
		{ field: 'role', sort: 'role', render: 'badge', labels: 'common:roles' },
		{ field: 'status', render: 'badge', tone: (v) => (v === 'blocked' ? 'destructive' : 'outline') },
		{ field: 'joinedAt', sort: 'joinedAt', render: 'date' },
	],
	search: true, // строка поиска → input.q
	filters: [
		{ field: 'role', options: STAFF_ROLES, labels: 'common:roles' }, // field — ключ filters контракта
		{ field: 'status', options: MEMBER_STATUSES },
	],
	create: {
		schema: StaffInvite, // та же схема, что вход процедуры
		fields: { role: { labels: 'common:roles' } },
		initial: { role: 'teacher' },
		submit: (values) => client.invitations.create(values),
	},
	actions: [
		action({
			key: 'changeRole',
			visible: (row, viewer) => row.role !== 'owner' && row.id !== viewer.memberId,
			form: {
				schema: z.object({ role: StaffInviteRole }),
				fields: { role: { labels: 'common:roles' } },
				initial: (row) => (row.role === 'owner' || row.role === 'student' ? {} : { role: row.role }),
			},
			run: (row, values) => client.members.changeRole({ id: row.id, role: values.role }),
		}),
		{
			key: 'block',
			variant: 'destructive',
			confirm: true,
			visible: (row) => row.status === 'active',
			run: (row) => client.members.setStatus({ id: row.id, status: 'blocked' }),
		},
	],
})
```

Типы проверяют описание по контракту: `sort` — только из `sorts` процедуры, `filters[].field` — только из её
`filters`, `columns[].field` — только поля строки. Действие с формой — через `action()` (значения `run` типизированы
схемой формы); без формы — обычный объект.

Маршрут (создаёт генератор):

```tsx
// apps/web/src/routes/admin/staff/index.tsx
export const Route = createFileRoute('/admin/staff/')({
	validateSearch: resourceSearch, // page, q, sort, dir, filters — в адресе; битое отбрасывается
	beforeLoad: requirePerm(staffResource.perms.read),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <ResourcePage resource={staffResource} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
```

`ResourcePage` берёт права зрителя и текст ошибок из `ResourceProvider` — он уже стоит в `routes/admin/route.tsx`.

## Справочник

Типы — `packages/ui/src/resource/types.ts`; используй только существующие опции.

| Часть | Варианты |
| ----- | -------- |
| `columns[].render` | `text` (по умолчанию), `badge` (+ `tone(value)` → `default`/`secondary`/`destructive`/`outline`), `date`, `datetime`, `number`, `bool`, функция `(row) => ReactNode` |
| `columns[].labels`, `filters[].labels`, `fields.<поле>.labels` | префикс подписей значений (`common:roles`); по умолчанию `<ns>:<key>.values.<поле>.<значение>`, нет строки — само значение |
| `filters[]` | `{ field, options }` — выбор одного значения (select «все / …») |
| `create` | `schema`, `fields`, `layout`, `initial`, `submit(values)`, `perm` (по умолчанию `perms.write`), `mode: 'sheet' \| 'dialog'` |
| виджет поля (`fields.<поле>.widget`) | по типу zod: string→`input`, email (в т.ч. `pipe(z.email())`)→`email`, enum→`select`, boolean→`switch`, number→`number`; явно: `textarea`, `select` с `options` |
| `fields.<поле>` | `hint: true` (строка `hints.<поле>`), `visibleIf: (values) => boolean` — поле должно быть необязательным в схеме (скрытое не отправляется) |
| `layout` | строки полей: `[['firstName', 'lastName'], ['email']]` |
| `actions[]` | `key`, `perm` (по умолчанию `perms.write`), `visible(row, viewer)`, `variant: 'destructive'`, `confirm: true` (подтверждение) или `form` (диалог с формой, `initial(row)`), `run(row, values)`; после успеха — тост и перезагрузка списка |

Права: кнопка «создать» и действия скрыты без права (`viewer.permissions` из `schools.me`), запрещает сервер.
После изменений вне ресурса список обновляют `queryClient.invalidateQueries({ queryKey: resourceKey('<key>') })`.

Не хватает опции (выбор строк и массовые действия, виджеты `richtext`/`image`/`ref`, фильтр по дате) — запрос к ядру
`docs/tasks/requests/`, не самописная таблица рядом.

## Строки

Раздел `<ns>:<key>` в `packages/i18n/locales/ru/<ns>.json`:

| Ключ | Где |
| ---- | --- |
| `title`, `description` | заголовок экрана |
| `fields.<поле>` | колонки, фильтры, поля форм |
| `values.<поле>.<значение>` | бейджи и варианты select без `labels` |
| `search` (необязательно) | подсказка в поиске |
| `empty.title`, `empty.description` | пустой список без фильтров |
| `create.button`, `create.title`, `create.description` (необяз.), `create.submit`, `create.success` | форма создания |
| `actions.<key>.label`, `.title`, `.description` (необяз.), `.submit`, `.success` | действия; в строки подставляются поля строки (`{{name}}`) |

Общие (`common:resource.*`): поиск, «все», страницы, «ничего не нашлось». Ошибки API — `errors:<CODE>`.
Полноту строк проверяет `apps/web/src/features/resources.test.ts` по реестру `features/resources.ts` (`resourceKeys()`).

## Сервер

Вход списка — `pageInput({ sorts, defaultSort, filters })` в контракте (`@dinastia/contracts/common`), выход —
`page(Row)`; сервис — `listQuery()` + `toPage()` (скилл `data-access`). Сортировка или фильтр не из контракта — 400.

## Шаги

1. Контракт сущности: схема строки, `list` на `pageInput`, процедуры действий — скилл `api-endpoints`.
2. `pnpm gen:resource <модуль> <ресурс> --row <СхемаСтроки> [--api <namespace>] [--perm <право>] [--title "…"]` —
   ресурс с колонками из схемы, маршрут `/admin/<ресурс>`, раздел строк, запись в `features/resources.ts`
   (`--dry-run` — показать изменения). `--api` — namespace процедур в контракте (по умолчанию camelCase ресурса),
   `--perm` — право чтения (по умолчанию `<модуль>.access`).
3. Сортировки, поиск, фильтры, форма, действия; подписи в `<модуль>.json` (генератор кладёт имена полей).
4. Пункт меню в `features/<m>/nav.ts` (скилл `web-screens`).
5. `pnpm check`; e2e: открыть список, найти, отфильтровать, создать, действие (образец — `tests/e2e/staff.spec.ts`).

## Остановись и спроси, если

- нужен виджет, тип колонки или фильтр, которого нет в `types.ts`;
- экран не укладывается в «список + форма + действия» — это продуктовый экран (`web-screens`).
