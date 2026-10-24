---
name: web-screens
description: Экраны и навигация клиента Dinastia — файловые маршруты TanStack Router в apps/web/src/routes (области admin для сотрудников, learn для учеников, _auth), лэйауты областей, защита маршрута requirePerm/requireRole, загрузка данных в loader через ensureQueryData, параметры поиска с zod (validateSearch), пункты меню nav.ts в features/<m>, состояние загрузки/ошибки/пусто, мутации и инвалидация, продуктовые экраны вручную (конструктор урока, плеер, проверка ДЗ). Использовать для «новый экран/страница», «пункт меню», «маршрут», «кабинет ученика», «дашборд».
---

# Экраны и навигация

> Статус: целевой — сверить с кодом в фазе 0 (0.7) и 1 (1.1).

Клиент — `docs/specs/architecture.md` §7. CRUD-экран сущности — скилл `admin-resource`; здесь — всё остальное.

## Маршруты

```
apps/web/src/routes/
  __root.tsx                    провайдеры, тема школы
  _auth/login.tsx, _auth/magic.tsx, _auth/register-school.tsx
  admin/route.tsx               лэйаут области admin: сайдбар из nav, requireArea('admin')
  admin/courses/index.tsx       /admin/courses
  admin/courses/$courseId/route.tsx      лэйаут курса (вкладки)
  admin/courses/$courseId/lessons/$lessonId.tsx
  learn/route.tsx               лэйаут области learn
  learn/index.tsx               мои курсы
  learn/courses/$courseId/lessons/$lessonId.tsx  плеер
```

Экран:

```tsx
// apps/web/src/routes/admin/assessments/review.tsx
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '@/app/guards'
import { reviewQueueQuery } from '@/features/assessments/api'
import { ReviewQueue } from '@/features/assessments/review/review-queue'

const Search = z.object({
  status: z.enum(['submitted', 'needs_revision']).default('submitted'),
  groupId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
})

export const Route = createFileRoute('/admin/assessments/review')({
  validateSearch: Search,
  beforeLoad: requirePerm('assessments.review'),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(reviewQueueQuery(deps)),
  component: () => <ReviewQueue search={Route.useSearch()} />,
})
```

Правила:
- Компонент маршрута — тонкий; экран — в `features/<m>/<экран>/`.
- Состояние фильтров и вкладок — в search-параметрах (ссылкой можно поделиться), не в `useState`.
- Данные — `useSuspenseQuery(<query>(...))` теми же `queryOptions`, что в `loader`; загрузка — `pendingComponent`
  области, ошибка — `errorComponent` области, пусто — `<EmptyState>` из `packages/ui`.
- Мутации — `useMutation(orpc.<m>.<proc>.mutationOptions())`, после успеха `invalidateQueries` по `orpc.<m>.key()`,
  уведомление `toast.success(t(...))`.
- Область `learn` — только процедуры `learn*` контрактов.

## Меню

```ts
// apps/web/src/features/assessments/nav.ts
import { defineNav } from '@/app/nav'
import { ClipboardCheck, ListChecks } from 'lucide-react'

export const nav = defineNav([
  { area: 'admin', to: '/admin/assessments/review', label: 'assessments:nav.review', icon: ClipboardCheck,
    perm: 'assessments.review', group: 'learning', order: 30, badge: 'assessments.reviewCount' },
  { area: 'admin', to: '/admin/assessments/bank', label: 'assessments:nav.bank', icon: ListChecks,
    perm: 'assessments.bank.read', group: 'content', order: 20 },
])
```

Группы сайдбара — `content`, `learning`, `people`, `analytics`, `settings`; `badge` — ключ процедуры-счётчика.

## Продуктовые экраны

Конструктор урока, плеер, экран проверки — пишутся вручную из `packages/ui` (скилл `ui-kit`) и хостов реестров
(`BlockEditorHost`, `BlockViewerHost` — скилл `lesson-blocks`). Требования:
- адаптивность от 360px (ученик часто с телефона);
- автосохранение черновиков (debounce 1 с, индикатор «Сохранено»);
- клавиатура и фокус (скилл `ui-kit`, доступность);
- `data-testid` на ключевых элементах (скилл `testing`).

## Готово, когда

Экран открывается по ссылке с параметрами, недоступен ролям без права (редирект/403), работает на 360px,
`pnpm check` и e2e-сценарий экрана зелёные.

## Остановись и спроси, если

- нужна новая область (кроме `admin`, `learn`, `_auth`, `ops`) или публичная страница без входа;
- экрану нужен realtime (это R3);
- макета нет, а экран сложный — попроси референс или предложи вайрфрейм.
