---
name: permissions
description: Роли и права в Dinastia — роли школы owner/admin/teacher/curator/student, разрешения модуля definePermissions в apps/api/src/modules/<m>/permissions.ts (ключ <модуль>.<действие> → роли, owner неявно всё), сводный реестр apps/api/src/permissions.ts (тип Permission, can, rolePermissions), проверка в процедуре .use(can('…')) после mw.member, проверка в сервисе ctx.can(), тест-страж «у каждой процедуры участника есть право», ограничения на уровне записи (политики policies.ts — куратор видит свои группы, ученик — свои данные), изоляция школ через RLS, скрытие в UI по permissions из schools.me. Использовать для «доступ», «права», «кто может», «скрыть кнопку», «роль», «только свои».
---

# Права

> Статус: сверено с кодом в фазе 0 (пункт 0.6); политики записей (`policies.ts`) и `useCan` в вебе — с фаз 0.7/2.
> Образец — `apps/api/src/modules/schools/permissions.ts`, тесты — `apps/api/src/kernel/permissions.test.ts`.

Роли — `docs/specs/domain.md` §2. Три слоя защиты:

| Слой | Что решает | Где |
|---|---|---|
| RLS | данные **школы** — только своей | `tenantTable` (скилл `db-schema`), автоматически |
| разрешение | **роль** может выполнить действие | `permissions.ts` модуля + `.use(can('…'))` в процедуре |
| политика | **какие записи** доступны (свои группы, свои попытки) | `policies.ts` модуля + условие в сервисе |

UI только прячет; запрещает всегда сервер.

## Разрешения модуля

```ts
// apps/api/src/modules/schools/permissions.ts
import { definePermissions } from '#/kernel/permissions.ts'

// owner имеет все разрешения неявно — в списках его не пишут
export const permissions = definePermissions('schools', {
	access: ['admin', 'teacher', 'curator', 'student'], // войти в школу и узнать свою роль
	'members.read': ['admin', 'teacher'],
	'members.manage': ['admin'],
	'settings.manage': ['admin'],
	delete: [], // только owner
})
// ключи: 'schools.access', 'schools.members.read', 'schools.members.manage', …
```

Новый модуль — строка в сводном реестре:

```ts
// apps/api/src/permissions.ts
export const permissionMap = mergePermissions(schools, courses /* , … */)
export type Permission = keyof typeof permissionMap
export const can = createCan(permissionMap)
```

- Ключ — `<модуль>.<действие>`; действия: `access`, `read`, `manage` (создать/изменить/удалить), глаголы домена
  (`publish`, `review`, `enroll`), подобласти через точку (`members.read`).
- `mergePermissions` падает на старте при дубле ключа или неизвестной роли.
- Роли по умолчанию заданы кодом; роли и названия, настраиваемые школой, — не делаем (D-028).

## Проверки

```ts
// процедура — сразу после mw.member (скилл api-endpoints §2)
import { can } from '#/permissions.ts'

create: impl.invitations.create
	.use(mw.host)
	.use(mw.session)
	.use(mw.school)
	.use(mw.tenantTx)
	.use(mw.member)
	.use(can('schools.members.manage'))
	.handler(async ({ input, context }) => inviteStaff(schoolCtx(context), input)),

// сервис — условная логика
if (!ctx.can('schools.members.manage')) fail.forbidden('NO_PERMISSION')
```

Отказ `can()` — 403 `{ data: { code: 'NO_PERMISSION', permission: 'schools.members.manage' } }`.

**Страж** (`apps/api/src/kernel/router-guard.ts`, тест в `permissions.test.ts`): у каждой процедуры с `mw.member`
после него должен быть `can(…)`. Забыл — `pnpm check` красный с путём процедуры. Процедура, доступная любому участнику,
использует `can('<модуль>.access')`.

Бизнес-правила сверх роли (admin не может пригласить admin, нельзя заблокировать владельца) — в сервисе через
`fail.forbidden('<КОД>')`, не через разрешения.

## Политика записи (с фазы 2)

```ts
// apps/api/src/modules/assessments/policies.ts
export function reviewScope(ctx: SchoolCtx) {
	if (ctx.member.role !== 'curator') return undefined
	return inArray(enrollments.groupId, curatorGroupIds(ctx)) // подзапрос по group_curators
}
// сервис: .where(and(eq(submissions.status, 'submitted'), reviewScope(ctx)))
```

Запись вне скоупа в `get` → `fail.notFound`, не `forbidden` (не раскрываем существование).

## В UI

`schools.me` возвращает `permissions` (список ключей роли). Веб (0.7) прячет недоступное по нему: пункты меню,
маршруты (`beforeLoad`), кнопки и действия ресурсов принимают `perm`.

## Тесты

- Матрица «роль → разрешения» модуля — `it.each` по ролям через `rolePermissions(role)` (образец в
  `permissions.test.ts`): изменение прав роли видно в diff теста.
- Матрица процедуры — `expectPermissionMatrix(t, (c) => c.<m>.<proc>(…), { allow, deny })` из `#/test/school.ts`
  (скилл `testing`): каждая роль обязана быть в `allow` или `deny`.
- Политики: куратор не видит чужую группу (`notFound`).

## Готово, когда

`pnpm check` зелёный (включая страж), матрица модуля обновлена, есть HTTP-тест отказа.

## Остановись и спроси, если

- нужна новая роль или изменение прав существующей роли — решает человек;
- доступ зависит от оплаты или тарифа (R2);
- действие должно быть доступно без входа.
