---
name: api-endpoints
description: API Dinastia на oRPC 1.16 — контракт в packages/contracts/src/<m>.ts (zod-схемы, oc.route с методом и путём для REST/OpenAPI, подключение в contracts/src/index.ts), реализация в apps/api/src/modules/<m>/router.ts (impl.<m>.<proc> + цепочка mw.host → mw.session → mw.school → mw.tenantTx → mw.member, handler → сервис, schoolCtx), подключение в apps/api/src/router.ts, ошибки AppError/fail → ORPCError с data.code, процедуры learn для учеников, совместимость контракта, входы /api/rpc (веб) и /api/v1 + /api/openapi.json (мобайл, интеграции), клиент orpc + TanStack Query в web. Использовать для «добавь эндпоинт/метод API/процедуру», «поле в ответе», «REST для интеграции».
---

# API: контракт и процедуры

> Статус: сверено с кодом в фазе 0 (пункт 0.5); `can('perm')` — пункт 0.6. Образец — модуль `schools`
> (`packages/contracts/src/schools.ts`, `apps/api/src/modules/schools/router.ts`, тесты `apps/api/src/router.test.ts`).

Контракт — источник правды (D-004): из него типы клиента, валидация входа/выхода, REST и OpenAPI.

## 1. Контракт

```ts
// packages/contracts/src/schools.ts (фрагмент)
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id } from './common/index.ts'

export const SchoolPublic = z.object({ id: Id, slug: z.string(), name: z.string() })
export const StaffInvite = z.object({ email: Email, role: StaffInviteRole })

export const invitationsContract = {
	create: oc
		.route({ method: 'POST', path: '/school/invitations', successStatus: 201 })
		.input(StaffInvite)
		.output(z.object({ id: Id, expiresAt: DateTime })),
	get: oc.route({ method: 'GET', path: '/invitations/{token}' }).input(InvitationToken).output(InvitationPublic),
}
```

Подключение — `packages/contracts/src/index.ts`: `export const contract = { schools: schoolsContract, … }`.

- Именование: `list`, `get`, `create`, `update`, `remove`/`archive` + глаголы домена (`publish`, `accept`).
- Путь — REST-ресурс (`/school/invitations`, `/invitations/{token}`); параметры пути — поля `input`.
- Общие схемы (`Id`, `Email`, `DateTime`, пагинация) — `packages/contracts/src/common/`.
- Процедуры ученика — отдельный контракт `learn<Модуль>` с путями `/learn/...`: свои схемы выхода (без черновиков и
  ответов, D-020).
- **Секреты в ответ не кладутся**: токены приглашений, хеши, правильные ответы (тест «токен не возвращается в API»).

## 2. Реализация

```ts
// apps/api/src/modules/schools/router.ts (фрагмент)
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { inviteStaff } from './invitations.service.ts'

export const invitationsRouter = {
	create: impl.invitations.create
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.handler(async ({ input, context }) => {
			const inv = await inviteStaff(schoolCtx(context), input)
			return { id: inv.invitationId, expiresAt: inv.expiresAt }
		}),
}
```

Подключение — `apps/api/src/router.ts`: `impl.router({ schools: schoolsRouter, invitations: invitationsRouter, … })`.

Цепочки (`apps/api/src/kernel/orpc.ts`), порядок фиксирован:

| Нужно процедуре | Цепочка | В `context` |
|---|---|---|
| ничего (публично, любой хост) | `.use(mw.host)` | `headers`, `ip`, `now`, `host` |
| вход, без школы (корень: мои школы, регистрация школы) | `+ .use(mw.session)` | `user` |
| школа хоста, без входа (страница приглашения, вход в школу) | `.use(mw.host).use(mw.school).use(mw.tenantTx)` | `school`, `db` |
| вход + школа, без членства (принять приглашение) | `.use(mw.host).use(mw.session).use(mw.school).use(mw.tenantTx)` | `user`, `school`, `db` |
| **участник школы — по умолчанию** | `… .use(mw.tenantTx).use(mw.member)` | + `member` → `schoolCtx(context)` |

- `mw.tenantTx` открывает транзакцию школы на всю процедуру — `context.db` видит только её данные (RLS).
- С пункта 0.6 после `mw.member` — `.use(can('<perm>'))`; процедура без него не проходит `check:registries`.
- Handler — короткий: вызвать сервис (скилл `data-access`) и собрать ответ по схеме выхода. Проверки, правила,
  письма — в сервисе.
- Публичная процедура (без `mw.session`) — только с согласия человека.

## 3. Ошибки

Сервис бросает `fail.<вид>('<КОД>', data?)` (`apps/api/src/kernel/errors.ts`) → ответ с HTTP-классом вида и
`data.code`:

| `fail.` | HTTP | ORPCError code |
|---|---|---|
| `invalid` | 400 | `BAD_REQUEST` |
| `unauthorized` | 401 | `UNAUTHORIZED` |
| `forbidden` | 403 | `FORBIDDEN` |
| `notFound` | 404 | `NOT_FOUND` |
| `conflict` | 409 | `CONFLICT` |
| `tooMany` | 429 | `TOO_MANY_REQUESTS` |

```json
{ "code": "CONFLICT", "status": 409, "message": "ALREADY_MEMBER", "data": { "code": "ALREADY_MEMBER", "email": "…" } }
```

- Вход не прошёл схему контракта — 400 автоматически (`issues`); ZodError внутри сервиса — 400 `INVALID_INPUT`.
- Ядро кидает `UNAUTHENTICATED` (401), `SCHOOL_NOT_FOUND` (404), `NOT_A_MEMBER` (403).
- Любое другое исключение — 500: так бизнес-ошибку не сообщают.
- Клиент показывает `t('errors:' + data.code)` (скилл `i18n`).

## 4. Входы

| Вход | Для кого | Формат |
|---|---|---|
| `/api/rpc/<модуль>/<процедура>` | веб-клиент | oRPC RPC (`{"json": …}`) |
| `/api/v1/<path из контракта>` | мобайл, интеграции, curl | REST по `oc.route` |
| `/api/openapi.json` | документация, генерация клиентов | OpenAPI 3 из контракта |
| `/api/auth/*` | better-auth (вход, magic link) | — |

Школа определяется по хосту запроса (`<slug>.<APP_DOMAIN>`), поэтому для curl нужен заголовок `Host` (скилл
`local-env`).

## 5. Совместимость

- Можно: добавить процедуру, необязательное поле входа, поле выхода.
- **Ломает клиентов** (согласовать, отметить в карточке): удалить/переименовать процедуру или поле, сделать поле
  обязательным, сузить тип, поменять путь.

## 6. Клиент (web)

```ts
// apps/web/src/app/orpc.ts — уже есть
export const client: ContractRouterClient<Contract> = createORPCClient(link)
export const orpc = createTanstackQueryUtils(client)

// в фиче:
const { data } = useSuspenseQuery(orpc.schools.me.queryOptions())
const invite = useMutation(orpc.invitations.create.mutationOptions({
	onSuccess: () => qc.invalidateQueries({ queryKey: orpc.invitations.key() }),
}))
```

## Тесты

Интеграционный тест процедуры через HTTP (`apps/api/src/test/http.ts`: `call(method, path, { slug, cookie, body })`,
`signUp()`): успешный путь, 401 без входа, 403 не участнику и участнику другой школы, коды бизнес-ошибок. Образец —
`apps/api/src/router.test.ts` (там же — проверка типизированным клиентом и состава OpenAPI).

## Готово, когда

`pnpm check` зелёный, процедура видна в `/api/openapi.json`, есть тест прав и ошибок.

## Остановись и спроси, если

- изменение ломает контракт;
- нужна публичная процедура;
- нужен потоковый ответ, вебхук внешнего сервиса или загрузка файла через API (файлы — скилл `files-media`).
