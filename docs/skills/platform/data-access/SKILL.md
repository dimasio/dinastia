---
name: data-access
description: Код доступа к данным и бизнес-логика в Dinastia — сервисные функции service.ts от контекста (ctx.db — транзакция с тенантом, ctx.user, ctx.member, ctx.emit, ctx.jobs), выборки Drizzle (select, relational query, join), пагинация paginate и фильтры applyFilters, создание/обновление/удаление, транзакции и блокировки, вызов сервиса другого модуля, N+1, ошибки fail.*, что нельзя (глобальный db, school_id руками). Использовать для «напиши логику», «выборка», «посчитай», «обнови статус», «сервис», «запрос к БД».
---

# Доступ к данным

> Статус: сверено с кодом в фазе 0 (0.3–0.6); `paginate`/`applyFilters` — 1.2, `ctx.emit`/`ctx.jobs` — 1.6, lint-запрет
> глобального клиента — 1.1.

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

`SchoolCtx` (`apps/api/src/kernel/context.ts`): `db`, `school`, `user`, `member`, `can`, `now`, `log`; с фазы 1.6 —
`emit`, `jobs`. В процедуре его собирает `schoolCtx(context)` (скилл `api-endpoints`); в интеграционном тесте — вручную
внутри `withTenant` (образец — `inSchool` в `apps/api/src/modules/schools/schools.test.ts`).

Списки с пагинацией, поиском и фильтрами — `paginate()` (пункт 1.2): до него — `select … limit/offset` руками.

## Правила

- **Только `ctx.db`.** Это транзакция с установленным `app.school_id`; глобальный клиент `#/kernel/db/client` в
  модулях запрещён (lint-правило). `school_id` в `where`/`values` не пишется — его ставят RLS и default.
- **Один запрос — одна транзакция.** Вся процедура уже в транзакции; вложенная — `ctx.db.transaction()` (savepoint),
  только если нужна частичная откатываемость.
- **Внешние вызовы** (почта, видео, платёжки) — в фоновой задаче, не в запросе. Временное исключение до 1.6–1.8: письмо
  приглашения уходит синхронно (`sendMail` в `inviteStaff`) — перевести на `ctx.mail.send` в пункте 1.8.
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
