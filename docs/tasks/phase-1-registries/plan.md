# План фазы 1

## Ход

| Дата | Пункт | Что |
|---|---|---|
| 2026-10-24 | — | задача создана; порядок пунктов — по зависимостям (task.md) |
| 2026-10-24 | 1.1 | `defineModule` + `collectRouters` (модуль = роутер по namespace контракта + разрешения; дубли namespace и чужой префикс прав — ошибка на старте); реестр `modules/index.ts`; меню из фич (`defineNav`, `visibleNav`, `SideNav`, типизированный `to`); `pnpm gen:module` (19 изменений у маркеров `gen:module:*`, `--dry-run`, отказ при повторе); lint-запрет `#/kernel/db/client.ts` в модулях (исключение для регистрации школы — с причиной); CI проверяет генератор пробным модулем |
| 2026-10-24 | 1.1 | находки пробного запуска генератора: маркер совпадал по подстроке (`…permissions` в `…permissions-import`); тип `Permission` схлопывался в `never` при двух модулях; матрица прав в тестах ломалась от нового модуля — сделана по модулю. Урок процесса: откат пробы `git checkout -- .` снёс незакоммиченное исправление — сначала коммит, потом проба |
| 2026-10-24 | 1.9 | `withTestSchool` (школа + 5 ролей, `as(role)` — типизированный клиент), `clientFor`, `expectPermissionMatrix` (проверена мутацией: лишняя роль в allow — понятное падение), `cleanupTestSchools`; e2e `fixtures.ts` (`loginAs`, `DEMO`, `schoolUrl`) + сценарий меню. Тесты 61, e2e 5 |
| 2026-10-24 | 1.2 | сервер (коммит `d132342`): `page()`/`pageInput` в `contracts/common/page.ts`; хелперы `listQuery`/`toPage` в `kernel/db/listing.ts` (поиск ILIKE с экранированием, фильтры-равенства, сортировка со стабильным вторым ключом); API сотрудников `schools.members.list/setRole/setStatus` + тесты. Клиентская часть не начата |
| 2026-10-25 | 1.2 | клиент: `@dinastia/ui/resource` — `defineResource`/`action`, `ResourcePage` (поиск с задержкой, фильтры, страницы, сортировка, форма создания в sheet/dialog, действия с формой или подтверждением, тосты, перезагрузка списка), `ResourceTable` (TanStack Table 9, D-043), `ResourceForm` (react-hook-form + zod контракта, поля из схемы), `ResourceProvider`, `resourceSearch` (состояние в адресе), `resourceKeys`; shadcn table/select/dialog/alert-dialog/switch; `requirePerm`; экран «Сотрудники» `/admin/staff` + меню «Люди»; `pnpm gen:resource` (колонки — из zod-схемы контракта; JSON-разделы строк — `jsonSection`) + проба в CI; реестр `features/resources.ts` и тест полноты строк (проверен мутацией). Тесты: ui 5, web 2, api 68, e2e 9 |
| 2026-10-25 | 1.2 | находки: вчерашний коммит сервера оставил красным тест OpenAPI (новые пути не внесены) — дополнен; e2e-набор упёрся в лимит входов 5/мин с IP → `AUTH_SIGN_IN_LIMIT` вне production (D-044); `pnpm add` переписывает кавычки в `pnpm-workspace.yaml`/`pnpm-lock.yaml` — после него `biome check --write` по ним; тип входа `list` выводится только при передаче процедуры как есть (`list: client.x.list`), стрелка теряет вывод |
| 2026-10-25 | 1.6 | pg-boss 12.38: `defineJob`/`ctx.jobs.send` (в транзакции запроса через `fromDrizzle`), `defineEvent`/`on`/`ctx.emit` (задача на подписчика, D-045), `BaseCtx` (общий для процедуры и задачи) + `tenantCtx`, `forEachSchool`, `defineModule({ jobs, subscribers })` → `kernel/registry.ts`, исполнитель (`fail.*`/zod — deadletter без повтора, остальное — повтор; приостановленная школа — пропуск), воркер `src/worker.ts` (`pnpm dev` = API + воркер), `pnpm jobs:list|run`; схема `pgboss` — в `db:migrate` под `app_owner`, `app_user` — только DML. Тесты: 7 интеграционных (откат/коммит, RLS задачи, событие → подписчик → задача, повтор с одним эффектом, fail без повтора, all-schools), api 75 |
| 2026-10-25 | 1.6 | находки: обязательный peer pg-boss `@opentelemetry/api` раздвоил `drizzle-orm` (вариант с otel в api, без — в `@dinastia/db`) → типы таблиц несовместимы; лечится `@opentelemetry/api` в корне (один вариант на всех). Задачу all-schools из запроса ставить нельзя (ошибка), расписание — только у all-schools |

## План 1.6

1. Зависимость `pg-boss` 12.38.0 (MIT, Postgres-only, D-008) → `apps/api`.
2. `kernel/jobs.ts`: `defineJob({ name, schema, handler, retry, timeout, singletonKey, schedule, scope })`, `ctx.jobs.send(job, data, { startAfter })` — в транзакции запроса (`fromDrizzle(tx)`): откат — задачи нет. Обёртка handler: zod-проверка данных, `withTenant(schoolId)` → `JobCtx`, лог с `job`/`jobId`/`schoolId`, `fail.*` — без повтора. `scope: 'all-schools'` — `forEachSchool` (транзакция на школу). Расписания — cron, Europe/Moscow.
3. `kernel/events.ts`: `defineEvent(name, schema)`, `on(event, handler)`, `ctx.emit(event, data)` — по задаче на каждого подписчика в той же транзакции (очередь `<модуль>.on.<событие>`, retry). **Outbox — таблица задач pg-boss** (транзакционная постановка), отдельной таблицы `outbox` нет — см. «Решить».
4. Контекст: `BaseCtx` (`db`, `school`, `now`, `log`, `emit`, `jobs`) — общий для процедуры и задачи; `SchoolCtx = BaseCtx + user, member, can`. Сервис, которому не нужен пользователь, принимает `BaseCtx`.
5. `defineModule({ …, jobs, subscribers })`; реестр очередей собирается из модулей, дубль имени — ошибка на старте.
6. Воркер `apps/api/src/worker.ts` (`pnpm dev` = api + web + worker, `pnpm --filter @dinastia/api worker`); схема pg-boss ставится в `db:migrate` под `app_owner`, `app_user` получает права на схему `pgboss`; в рантайме `migrate: false`.
7. Отладка: `pnpm jobs:list`, `pnpm jobs:run <имя> --school <slug> --data '{…}'`.
8. Тесты (интеграционные, реальная БД): постановка в транзакции и откат; событие → подписчик → задача (демо пункта); повтор подписчика не дублирует эффект; `fail.*` — без повтора; задача видит только свою школу (RLS); all-schools — по транзакции на школу. Хелпер `runJobs()` — выполнить очередь синхронно в тесте.
9. Сверка скиллов `background-jobs`, `events-automations`, `data-access` (`ctx.emit`/`ctx.jobs`), `core-kernel`, `local-env` (воркер), `testing` (`runJobs`).

Вне пункта: реальные доменные события продукта — вместе с их модулями (фазы 2–4, `domain.md` §4); письмо приглашения через очередь — 1.8.

## План 1.2, клиент

1. `packages/ui/src/resource/` (ядро): `types.ts` (`ResourceDef`), `define.ts` (`defineResource`, `col`, `filter`, `action`), `resource-table.tsx` (TanStack Table 9, серверные пагинация/сортировка, поиск с задержкой, фильтры-select, меню действий строки), `resource-form.tsx` (react-hook-form + zod; поля из схемы: string→input, enum→select, boolean→switch, number→number; `fields`, `layout`, `visibleIf`), `resource-page.tsx` (заголовок, кнопка «создать», таблица, форма в sheet/dialog, подтверждение, инвалидация списка после действия); состояние списка — в search-параметрах URL. Экспорт `@dinastia/ui/resource`.
2. shadcn-компоненты в `packages/ui`: table, select, dialog, alert-dialog, switch.
3. Зависимости `packages/ui`: `@tanstack/react-table` 9.3.1 (новая в каталоге; v9 стабильна с 08.2026), `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `react-i18next` (peer) — из каталога.
4. Экран «Сотрудники школы»: `apps/web/src/features/schools/resources/staff.ts` (колонки имя/email/роль/статус/дата, поиск, фильтры роль/статус, создание = приглашение `invitations.create`, действия «сменить роль» (форма) и «заблокировать/вернуть доступ» (подтверждение)); маршрут `/admin/staff`; `features/schools/nav.ts` (группа people, право `schools.members.read`); namespace `schools` в i18n.
5. `pnpm gen:resource <module> <entity>`: ресурс + маршрут + строки i18n; проба генератора в CI, как у `gen:module`.
6. Тесты: unit — вывод полей формы из zod, сборка входа списка; e2e `tests/e2e/staff.spec.ts` — список, поиск, фильтр, приглашение, смена роли, блокировка.
7. Сверка скилла `admin-resource` (поиск — `q`, не `search`; сервер — `listQuery`/`toPage`, а не `paginate`/`applyFilters`; `defaultSort`), `data-access`, `ui-kit`, `web-screens`; снять пометку «целевой» у `admin-resource`.

Вне пункта: выбор строк и массовые действия, виджеты richtext/image/ref — когда появятся сущности, которым они нужны (1.7, 1.12, фаза 2).

## Дальше

1.8: почта — `defineEmail`, отправка задачей (приглашение — через неё; токен приглашения не класть в данные задачи) — план пункта перед началом.
