---
name: web-screens
description: Экраны и навигация клиента Dinastia — файловые маршруты TanStack Router в apps/web/src/routes (области admin для сотрудников, learn для учеников, _auth), лэйауты областей, защита маршрута requirePerm/requireRole, загрузка данных в loader через ensureQueryData, параметры поиска с zod (validateSearch), пункты меню nav.ts в features/<m>, состояние загрузки/ошибки/пусто, мутации и инвалидация, продуктовые экраны вручную (конструктор урока, плеер, проверка ДЗ). Использовать для «новый экран/страница», «пункт меню», «маршрут», «кабинет ученика», «дашборд».
---

# Экраны и навигация

> Статус: сверено с кодом в фазе 0 (пункт 0.7); пункты меню из фич (`nav.ts`) — фаза 1.1.

Клиент — `docs/specs/architecture.md` §7. CRUD-экран сущности — скилл `admin-resource`; здесь — всё остальное.

## Маршруты

```
apps/web/src/
  main.tsx                     провайдеры: i18n, ThemeProvider, QueryClient, RouterProvider, Toaster
  app/                         ядро клиента: orpc.ts (клиент API), auth.ts (better-auth), queries.ts (sessionQuery,
                               meQuery), guards.ts (requireMember), host.ts (корень/школа), errors.ts (errorText),
                               layout/ (admin-shell, learn-shell, centered, user-menu)
  features/<модуль>/           экраны и компоненты фич (auth, schools, invite, …)
  routes/                      файловые маршруты (плагин генерирует routeTree.gen.ts — не править)
    __root.tsx                 notFound и errorComponent (текст ошибки по data.code)
    index.tsx                  корень: вход/«Ваши школы»; школа: редирект по роли (student → /learn, остальные → /admin)
    register.tsx               регистрация школы (только корень)
    login.tsx                  вход в школу (?redirect= — только относительный путь)
    invite.$token.tsx          приглашение сотрудника
    admin/route.tsx            лэйаут кабинета школы: requireMember({ staff: true }) → context.me
    admin/index.tsx            /admin
    learn/route.tsx            лэйаут кабинета ученика: requireMember()
    learn/index.tsx            /learn
```

Маршрут кабинета (образец — `routes/admin/route.tsx`):

```tsx
export const Route = createFileRoute('/admin')({
	beforeLoad: async ({ context, location }) => ({
		me: await requireMember(context.queryClient, { staff: true, href: location.href }),
	}),
	component: () => {
		const { me } = Route.useRouteContext()
		return <AdminShell me={me}><Outlet /></AdminShell>
	},
})
```

`requireMember` (`app/guards.ts`): не поддомен школы → `/`; 401 → `/login?redirect=…`; ученик в `staff`-области →
`/learn`; 403 (не участник) → errorComponent «У вас нет доступа к этой школе». Дочерние маршруты берут `me`
(роль, `permissions`) из `Route.useRouteContext()`.

Экран с данными и параметрами:

```tsx
// apps/web/src/routes/admin/assessments/review.tsx (образец для фаз 2+)
const Search = z.object({ status: z.enum(['submitted', 'needs_revision']).default('submitted'), page: z.number().int().min(1).default(1) })

export const Route = createFileRoute('/admin/assessments/review')({
	validateSearch: Search,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(orpc.assessments.review.queryOptions({ input: deps })),
	component: () => <ReviewQueue search={Route.useSearch()} />,
})
```

Правила:
- Компонент маршрута — тонкий; экран — в `features/<m>/`.
- Состояние фильтров и вкладок — в search-параметрах (ссылкой можно поделиться), не в `useState`; входящие
  редиректы — только относительные пути (`z.string().regex(/^\/(?!\/)/)`), без открытого редиректа.
- Данные — `useSuspenseQuery(orpc.<m>.<proc>.queryOptions(...))`, теми же `queryOptions`, что в `loader`; загрузка —
  `<Suspense fallback={<Skeleton/>}>`, ошибка — errorComponent, пусто — `<EmptyState>`.
- Мутации — `useMutation(orpc.<m>.<proc>.mutationOptions({ onSuccess }))`, после успеха `invalidateQueries`, тост
  `toast.success(t(...))`; ошибка — `t(errorText(error), { ns: 'errors' })` (`app/errors.ts`).
- Ссылки между корнем и школами — `hostUrl(slug?, path)` (`app/host.ts`), обычный `<a href>` (другой origin).
- `data-testid` на ключевых элементах: `<модуль>-<элемент>` (`auth-signin-submit`, `invite-accept`).

## Меню

```ts
// apps/web/src/features/assessments/nav.ts
import { defineNav } from '#/app/nav'
import { ClipboardCheck, ListChecks } from 'lucide-react'

export const nav = defineNav([
	{
		area: 'admin',
		to: '/admin/assessments/review',
		label: 'assessments:nav.review',
		icon: ClipboardCheck,
		perm: 'assessments.review',
		group: 'learning',
		order: 30,
		badge: 'assessments.reviewCount',
	},
	{
		area: 'admin',
		to: '/admin/assessments/bank',
		label: 'assessments:nav.bank',
		icon: ListChecks,
		perm: 'assessments.bank.read',
		group: 'content',
		order: 20,
	},
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
