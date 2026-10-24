---
name: api-endpoints
description: API Dinastia на oRPC — контракт в packages/contracts/src/<m>.ts (zod-схемы сущностей, входов и выходов, oc.route с методом и путём для OpenAPI), реализация в apps/api/src/modules/<m>/router.ts (middleware school/authed/pub, can('perm'), handler → service), процедуры области learn для учеников, ошибки, совместимость контракта, OpenAPI /api/openapi.json для мобайла и интеграций, вызов с клиента через orpc + TanStack Query. Использовать для «добавь эндпоинт/метод API/процедуру», «поле в ответе», «REST для интеграции».
---

# API: контракт и процедуры

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.5). Синтаксис oRPC — по документации установленной версии.

Контракт — источник правды (D-004): из него типы клиента, валидация входа/выхода и OpenAPI.

## 1. Контракт

```ts
// packages/contracts/src/courses.ts
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Id, Page, PageInput, RichText } from './common'

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const
export const CourseStatus = z.enum(COURSE_STATUSES)

export const Course = z.object({
  id: Id,
  title: z.string().trim().min(1).max(200),
  description: RichText.nullable(),
  status: CourseStatus,
  createdAt: z.coerce.date(),
})
export type Course = z.infer<typeof Course>

export const CourseCreate = Course.pick({ title: true, description: true })
export const CourseUpdate = CourseCreate.partial().extend({ id: Id })
export const CourseListInput = PageInput.extend({ status: CourseStatus.optional() })

export const coursesContract = {
  list: oc.route({ method: 'GET', path: '/courses' }).input(CourseListInput).output(Page(Course)),
  get: oc.route({ method: 'GET', path: '/courses/{id}' }).input(z.object({ id: Id })).output(Course),
  create: oc.route({ method: 'POST', path: '/courses' }).input(CourseCreate).output(Course),
  update: oc.route({ method: 'PATCH', path: '/courses/{id}' }).input(CourseUpdate).output(Course),
  publish: oc.route({ method: 'POST', path: '/courses/{id}/publish' }).input(z.object({ id: Id })).output(Course),
}
```

Подключение — `packages/contracts/src/index.ts`: `export const contract = { courses: coursesContract, … }`.

Именование процедур: `list`, `get`, `create`, `update`, `remove` (или `archive`) + глаголы предметной области
(`publish`, `enroll`, `submit`). Процедуры ученика — в отдельном контракте `learn<Модуль>`
(`learnCourses.get`) с путями `/learn/...`: у них другие схемы выхода (без черновиков и ответов).

## 2. Реализация

```ts
// apps/api/src/modules/courses/router.ts
import { impl, school, can } from '@/kernel/orpc'
import * as service from './service'

export const router = impl.courses.router({
  list: impl.courses.list.use(school).use(can('courses.read'))
    .handler(({ context, input }) => service.list(context, input)),
  create: impl.courses.create.use(school).use(can('courses.manage'))
    .handler(({ context, input }) => service.create(context, input)),
  publish: impl.courses.publish.use(school).use(can('courses.publish'))
    .handler(({ context, input }) => service.publish(context, input.id)),
  // …
})
```

| Middleware | Когда |
|---|---|
| `pub` | без входа (страница приглашения, проверка сертификата по номеру) — только с согласия человека |
| `authed` | вход есть, школа не нужна (список моих школ) |
| `school` | всё в контексте школы — **по умолчанию** |
| `can('<perm>')` | обязателен после `school` (скилл `permissions`); `check:registries` ругается на процедуру без него |

Handler — одна строка: вызвать сервис. Логика, проверки, события — в сервисе (скилл `data-access`).

## 3. Ошибки

Сервис бросает `fail.*` (скилл `data-access`) → клиент получает `ORPCError` с `code` HTTP-класса и `data.code`
(`COURSE_ARCHIVED`). Ошибки валидации zod — автоматически 400 с `issues`. Клиент показывает
`t('errors:' + data.code)`.

## 4. Совместимость

Контракт читают web и (позже) мобильное приложение и интеграции.

- Можно: добавить процедуру, необязательное поле входа, поле выхода.
- **Ломает клиентов** (согласовать, пометить в карточке изменения): удалить/переименовать процедуру или поле,
  сделать поле обязательным, сузить тип, поменять путь.

## 5. Клиент

```ts
// apps/web/src/features/courses/api.ts
import { orpc } from '@/app/orpc'
export const coursesQuery = (input: CourseListInput) => orpc.courses.list.queryOptions({ input })
// компонент:   const { data } = useSuspenseQuery(coursesQuery(params))
// мутация:     useMutation(orpc.courses.publish.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.courses.key() }) }))
```

## Готово, когда

`pnpm check` зелёный, процедура видна в `/api/openapi.json`, есть интеграционный тест «роль с правом — ок, без
права — 403» (скилл `testing`).

## Остановись и спроси, если

- изменение ломает контракт;
- нужна публичная процедура (`pub`);
- нужен потоковый ответ, вебхук внешнего сервиса или загрузка файла через API (файлы — скилл `files-media`).
