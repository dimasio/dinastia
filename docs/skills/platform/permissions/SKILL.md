---
name: permissions
description: Роли и права в Dinastia — роли школы owner/admin/teacher/curator/student, разрешения модуля definePermissions в modules/<m>/permissions.ts (ключ <модуль>.<действие> → роли), проверка в процедуре can('…'), проверка в коде ctx.can(), ограничения на уровне записи (политики policies.ts — куратор видит свои группы, ученик — свои данные), изоляция школ через RLS, скрытие в UI через useCan и perm у пунктов меню, ресурсов, действий. Использовать для «доступ», «права», «кто может», «скрыть кнопку», «роль», «только свои».
---

# Права

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.6).

Роли — `docs/specs/domain.md` §2. Три слоя защиты:

| Слой | Что решает | Где |
|---|---|---|
| RLS | данные **школы** — только своей | `tenantTable` (скилл `db-schema`), автоматически |
| разрешение | **роль** может выполнить действие | `permissions.ts` + `can()` в процедуре |
| политика | **какие записи** доступны (свои группы, свои попытки) | `policies.ts` + условие в сервисе |

UI только прячет; запрещает всегда сервер.

## Разрешения модуля

```ts
// apps/api/src/modules/assessments/permissions.ts
import { definePermissions } from '@/kernel/permissions'

export const permissions = definePermissions('assessments', {
  'bank.read':   ['owner', 'admin', 'teacher'],
  'bank.manage': ['owner', 'admin', 'teacher'],
  review:        ['owner', 'admin', 'teacher', 'curator'],
})
// ключи: 'assessments.bank.read', 'assessments.bank.manage', 'assessments.review'
```

- Ключ — `<модуль>.<действие>`; действия: `read`, `manage` (создать/изменить/удалить), глаголы домена (`publish`,
  `review`, `enroll`), подобласти через точку.
- Тип `Permission` — объединение всех ключей; опечатка в `can('…')` — ошибка компиляции.
- `owner` неявно имеет все разрешения. Ученик (`student`) в разрешениях `/admin` не участвует: его процедуры
  `learn.*` проверяют `can('learn.access')` + политику «только своё».
- Роли по умолчанию заданы кодом; настраиваемые школой роли — вне MVP.

## Проверки

```ts
// процедура
impl.assessments.review.use(school).use(can('assessments.review')).handler(...)

// в коде (условная логика)
if (!ctx.can('assessments.bank.manage')) fail.forbidden('NO_PERMISSION')

// политика записи
// apps/api/src/modules/assessments/policies.ts
export function reviewScope(ctx: SchoolCtx) {
  if (ctx.member.role !== 'curator') return undefined
  return inArray(enrollments.groupId, curatorGroupIds(ctx)) // подзапрос по group_curators
}
// сервис: .where(and(eq(submissions.status, 'submitted'), reviewScope(ctx)))
```

Политика `get`-процедуры: запись вне скоупа → `fail.notFound`, не `forbidden` (не раскрываем существование).

## В UI

```tsx
const can = useCan()
{can('courses.publish') && <Button onClick={publish}>{t('courses:publish')}</Button>}
```

Пункты меню (`nav.ts`), ресурсы и их действия (`defineResource`), маршруты (`beforeLoad: requirePerm('…')`)
принимают `perm` — используй его вместо ручных проверок.

## Готово, когда

Тест матрицы: для каждой процедуры — роли с правом получают ответ, без права — 403; для политик — куратор не видит
чужую группу (скилл `testing`, хелпер `expectPermissionMatrix`). `pnpm check` зелёный.

## Остановись и спроси, если

- нужна новая роль или изменение прав существующей роли — решает человек;
- доступ зависит от оплаты/тарифа (R2);
- действие должно быть доступно без входа.
