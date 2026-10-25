---
name: data-access
description: Код доступа к данным и бизнес-логика в Dinastia — сервисные функции service.ts от контекста (ctx.db — транзакция с тенантом, ctx.user, ctx.member, ctx.emit, ctx.jobs), выборки Drizzle (select, relational query, join), списки listQuery/toPage (пагинация, поиск, сортировка, фильтры), создание/обновление/удаление, транзакции и блокировки, вызов сервиса другого модуля, N+1, ошибки fail.*, что нельзя (глобальный db, school_id руками). Использовать для «напиши логику», «выборка», «посчитай», «обнови статус», «сервис», «запрос к БД».
---

# Доступ к данным

> Статус: сверено с кодом в фазе 0 (0.3–0.6) и 1 (1.1: lint-запрет глобального клиента; 1.2: `listQuery`/`toPage`);
> 1.6: `ctx.emit`/`ctx.jobs`, `BaseCtx`.

Контекст запроса — `docs/specs/architecture.md` §4.

## Сервисная функция

Бизнес-логика — в `service.ts` модуля (или `<часть>.service.ts`): функция `(ctx, input) → результат`. Роутер только
вызывает её; так её переиспользуют задачи, подписчики и другие модули. Реальный образец —
`apps/api/src/modules/schools/invitations.service.ts`:

```ts
export async function inviteStaff(ctx: SchoolCtx, input: StaffInvite) {
	const { email, role } = StaffInviteSchema.parse(input)                        // вход — по схеме контракта
	if (!ctx.can('schools.members.manage')) fail.forbidden('NO_PERMISSION')       // право (скилл permissions)
	if (role === 'admin' && ctx.member.role !== 'owner') fail.forbidden('ONLY_OWNER_INVITES_ADMIN') // правило домена

	const [existing] = await ctx.db                                               // ctx.db — транзакция школы (RLS)
		.select({ id: members.id })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(users.email, email))                                             // school_id не пишем — его ставит RLS
		.limit(1)
	if (existing) fail.conflict('ALREADY_MEMBER', { email })

	const [invitation] = await ctx.db
		.insert(invitations)                                                       // school_id подставит default
		.values({ email, role, tokenHash, invitedBy: ctx.member.id, expiresAt: new Date(ctx.now().getTime() + TTL) })
		.onConflictDoUpdate({                                                      // повторное приглашение — продлить
			target: [invitations.schoolId, invitations.email],
			targetWhere: eq(invitations.status, 'pending'),
			set: { role, tokenHash, invitedBy: ctx.member.id, expiresAt },
		})
		.returning({ id: invitations.id, expiresAt: invitations.expiresAt })
	…
}
```

Контексты (`apps/api/src/kernel/context.ts`): `BaseCtx` — `db`, `school`, `now`, `log`, `emit`, `jobs` (общий для
процедуры и фоновой задачи); `SchoolCtx = BaseCtx + user, member, can` (запрос участника). Сервис, которому не нужен
пользователь, принимает `BaseCtx` — его можно вызвать и из задачи. В процедуре контекст собирает `schoolCtx(context)`
(скилл `api-endpoints`); в задаче — ядро; в интеграционном тесте — `tenantCtx(tx, school, { now, log })` внутри
`withTenant` (образец — `inSchool` в `apps/api/src/modules/schools/schools.test.ts`).

Списки с пагинацией, поиском и фильтрами — `listQuery()` + `toPage()` (`#/kernel/db/listing.ts`), раздел ниже.

## Правила

- **Только `ctx.db`.** Это транзакция с установленным `app.school_id`; глобальный клиент `#/kernel/db/client` в
  модулях запрещён (lint-правило). `school_id` в `where`/`values` не пишется — его ставят RLS и default.
- **Один запрос — одна транзакция.** Вся процедура уже в транзакции; вложенная — `ctx.db.transaction()` (savepoint),
  только если нужна частичная откатываемость.
- **Внешние вызовы** (почта, видео, платёжки) — в фоновой задаче, не в запросе: письмо — `ctx.mail.send` (скилл
  `notifications`).
- **Конкуренция**: счётчики и лимиты (попытки теста, номер сертификата) — `select … for update` (`.for('update')`)
  или атомарный `update … set x = x + 1 returning`.
- **N+1**: списки с вложенными данными — relational query (`with: {...}`) или один `inArray()`-запрос и группировка
  в памяти; запрос в цикле по строкам запрещён.
- **Другой модуль** — импорт функции из его `service.ts` (`import { getOrFail as getCourse } from '../courses/service'`);
  его таблицы напрямую не трогать.
- **События** — `ctx.emit(event, data)`, **задачи** — `ctx.jobs.send(job, data)`: обе ставятся в транзакции запроса
  (откат — ни события, ни задачи) и выполняются воркером после коммита (скиллы `events-automations`, `background-jobs`).
- **Ошибки** — `fail.notFound(code)`, `fail.conflict(code)`, `fail.forbidden(code)`, `fail.invalid(code, data)` из
  `#/kernel/errors.ts` (как они превращаются в ответ API — скилл `api-endpoints` §3);
  `code` — `UPPER_SNAKE`, в i18n есть `errors:<code>`. Не бросать `Error` с текстом для пользователя.
- **Время** — `ctx.now()` (в тестах подменяется), не `new Date()`.
- **Права** проверяет процедура (`permissions`); ограничение «куратор видит только свои группы» — функция политики
  модуля (`policies.ts`), которую сервис добавляет в `where`.

## Пагинация и фильтры

Вход списка — `pageInput({ sorts, defaultSort, filters })` из `@dinastia/contracts/common`: `{ page, pageSize ≤ 100,
q?, sort, dir, filters }`; допустимые сортировки и фильтры — часть схемы, чужое отсекает контракт (400). Выход —
`page(Item)` → `{ items, total, page, pageSize }`. Сервис превращает вход в условия `listQuery()` и собирает ответ
`toPage()` (образец — `listStaff` в `apps/api/src/modules/schools/members.service.ts`):

```ts
export async function listStaff(ctx: SchoolCtx, input: StaffListQuery) {
	const q = listQuery(input, {
		search: [users.name, users.email], // ILIKE, % и _ экранируются
		sort: { name: users.name, role: members.role, joinedAt: members.joinedAt }, // каждая сортировка контракта
		tiebreak: members.id, // второй ключ — порядок стабилен между страницами
		filters: { role: members.role, status: members.status }, // равенство
	})
	const where = and(ne(members.role, 'student'), q.where) as SQL
	const [items, [total]] = await Promise.all([
		ctx.db.select(columns).from(members).innerJoin(users, eq(users.id, members.userId))
			.where(where).orderBy(...q.orderBy).limit(q.limit).offset(q.offset),
		ctx.db.select({ n: count() }).from(members).innerJoin(users, eq(users.id, members.userId)).where(where),
	])
	return toPage(items, total?.n ?? 0, input)
}
```

Экран к такому списку — ресурс (скилл `admin-resource`).

## Готово, когда

Сервис покрыт интеграционным тестом на реальной БД (скилл `testing`), `pnpm check` зелёный.

## Остановись и спроси, если

- нужен запрос по всем школам (это `forEachSchool` в задаче — скилл `background-jobs`, не в запросе пользователя);
- нужен сырой SQL сложнее одного `sql\`\``-фрагмента — покажи запрос человеку;
- нужна запись в таблицы другого модуля.
