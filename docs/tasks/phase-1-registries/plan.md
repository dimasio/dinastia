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
| 2026-10-25 | 1.8 | `kernel/mail/`: `defineEmail` (react-email 6, D-046), `EmailLayout`, `renderEmail` (HTML + текст), `ctx.mail.send` → задача `mail.send`, `deliverEmail` для писем с секретом, транспорт с именем школы-отправителя; `defineModule({ emails })`, namespace `emails`; приглашение: `inviteStaff` ставит `schools.send-invitation`, задача выпускает токен и шлёт письмо; `pnpm emails:preview`; Playwright поднимает API + воркер (`start:all`). Тесты: рендер всех примеров, экранирование, откат — письма нет, приглашение через очередь (api 80, e2e 9) |
| 2026-10-25 | 1.8 | находки: очередь создавал только воркер — API упал бы на постановке до старта воркера → очередь создаётся при первой постановке (`ensureQueue`); тестовые процессы делили одну очередь — задачу файла A выполнял воркер файла B, письмо уходило в чужой `memoryOutbox` → своя схема `pgboss_<n>` на процесс (`BOSS_SCHEMA`, `test/setup.ts`), файлы снова параллельно (19 с вместо 49 с при последовательном прогоне); дата в письме — в часовом поясе Москвы, а не сервера |
| 2026-10-25 | 1.7 | `kernel/storage`: таблица `files` (миграция `0002_files_avatars`, + `members.avatar_file_id`), S3 на AWS SDK v3 (D-047), `defineFilePurpose` + `defineModule({ files })`, `files.createUpload` (лимиты до ссылки; подписаны тип и длина) → PUT → `files.complete` (HEAD-сверка), `ctx.files` (signedUrl, get, remove → задача `files.delete-object`), `signFileKey`, очистка `pending` > 24 ч; модуль ядра `files` (право `files.upload`, право назначения — в сервисе). Аватар участника: `schools.updateMyAvatar`, `avatarUrl` в `me` и в списке сотрудников; UI — `ImageInput`, `UserAvatar`, `uploadFile` (XHR с прогрессом), экран «Профиль» в обеих областях, аватар в меню (me — из кэша запроса), колонка `avatar` в ресурсе. Тесты: 6 интеграционных на SeaweedFS (api 86), e2e 12 |
| 2026-10-25 | 1.7 | находки: внешние ключи `members ↔ files` в обе стороны замыкали вывод типов Drizzle → у `files.owner_member_id` FK нет, владельца проверяет код; меню пользователя брало `me` из контекста маршрута и не обновлялось после смены аватара → из кэша запроса; e2e-проверка «картинка видна» проходила на аватаре прошлого прогона до окончания загрузки → сценарий начинает с удаления и ждёт конец загрузки; сервер не разбирает содержимое файла — тип заявляет клиент, поэтому исполняемые типы в назначения не включаются |
| 2026-10-31 | 1.11 | `pii()`/`isPii` в `@dinastia/db` (флаг в config колонки), помечены ПДн-колонки ядра и `schools`, тест-страж «ключ pii-колонки маскируется в логах». **Миграция `0003_audit_webhooks`**: `audit_log` (REVOKE UPDATE/DELETE/TRUNCATE у `app_user`) и `webhook_events`. `ctx.audit` (актор — участник запроса, в задаче — система) — смена роли, блокировка, приглашение. `ctx.http` (`createHttp`) на `node:http(s)` с проверкой адреса в `lookup`, редиректы ≤ 3, таймаут, повторы идемпотентных. Вебхуки: `defineWebhookProvider`/`defineWebhookHandler`, `defineModule({ webhooks })`, `POST /api/webhooks/<provider>/<schoolId>`, задача `webhooks.process`, фейк с HMAC. `embedService` — согласованный список. D-048. Тесты: api 138 (+ журнал 5, pii 2, http 21, вебхуки 4, встраивания 20), e2e 12 |
| 2026-10-31 | 1.11 | находки: `drizzle-kit` под Node 22 не понимает импорты `#/…` (`ERR_INVALID_MODULE_SPECIFIER`) — генерировать под Node 24 из `.nvmrc` (`nvm use`); новые тестовые файлы с `withTestSchool` выявили гонку — процессы vitest слали регистрации с одних и тех же «IP» и упирались в общий лимит better-auth (429) → у каждого процесса свой /16 в `test/http.ts` |
| 2026-10-31 | 1.11+ | долг 1.11 — rate limit процедур: **миграция `0004_request_limits`**, `rateLimit({ name, max, windowSeconds, by: ip/user/member })` → 429 `RATE_LIMITED` + `retryAfter`; лимиты на `schools.create`, `invitations.create`, `files.createUpload`; scope задач `global` (`GlobalJobDef`, только ядро) и `rate-limit.cleanup`; D-049. Заодно убраны старые предупреждения линтера (`mail.test.ts`, `invitations.service.ts`). api 142, e2e 12 |
| 2026-10-31 | 1.12 | Tiptap 3.32.2 (9 пакетов, каталог) — в `packages/ui`. `@dinastia/contracts/common`: `RICH_TEXT_PROFILES`, `richTextSchema`/`RichText`/`CompactText`/`CommentText` (+ `richTextRegistry`), `richTextIssues`, `sanitizeRichText`, `toPlainText`, `isEmptyDoc`, `collectFileIds`; `…/rich-text/server` — `toHtml`. `@dinastia/ui/rich-text`: `RichTextEditor` (лениво, панель по профилю, ссылка — диалог, цвет — палитра, таблица, картинка через `uploadImage`), `RichTextView`; виджет ресурса `richtext`. Демо (решение владельца, вариант 1): песочница `/dev/rich-text` (только dev) + e2e `rich-text.spec.ts`; продуктовое поле — с курсами. D-050. Тесты: contracts 22, ui 14, api 142, e2e 14 |
| 2026-10-31 | 1.12 | находки: тест «редактор ↔ валидатор» сразу поймал атрибуты Tiptap, которых не было в правилах (`align` у ячеек, `title` у ссылки); `uniqueSlug` в тестах совпадал у параллельных процессов (409 на регистрации школы) — добавлен pid; тест аватара (S3 + задача) не укладывался в 5 с под нагрузкой — свой таймаут 15 с; сборка перегенерирует `routeTree.gen.ts` — `git stash` перед сборкой ломал возврат |
| 2026-10-31 | 1.3 | `@dinastia/db`: `lessonBlocks` (+ enum `block_state`), `blockTable`, `blockChildTable` (`item_key`), `settingsTable`, `tenantIsolation`/`schoolIdColumn`. **Миграция `0005_lesson_blocks_callout`**. Пакет `@dinastia/blocks` (`.`, `/server`, `/tables`, `/client`): `defineBlock` (проверки при объявлении), `defineBlockStorage` + `blockStorageIssues` (поля схемы = колонки), реестры с маркерами `gen:block:*`, `BlockEditorHost`/`BlockViewerHost`/`BlockPalette`, блок `callout` (выноска; термин — в глоссарий), namespace `blocks`. Ядро `kernel/blocks`: create/update/remove/reorder/list/publish/listPublic. `pnpm gen:block` + проба в CI. Песочница `/dev/blocks`, e2e `blocks.spec.ts`. Пункт 1.14 (настройки школы) — в роадмап. D-051. Тесты: blocks 10, api 147, e2e 16 |
| 2026-10-31 | 1.3 | находки: у дочерних строк блока `id` новый при каждой публикации — ответы на элементы терялись бы → `item_key`; генератор вставлял бы импорт иконки при каждом блоке (второй вызов падал) и регистрировал тип под camelCase-ключом (`blockDef('quote_box')` не нашёл бы) — исправлено до коммита; проба генератора — после WIP-коммита, откат пробы в dev-БД адресный (таблица + запись `__drizzle_migrations`); скриншоты поймали то, чего не видит e2e: Tailwind не сканировал `packages/blocks` (тона выноски без цвета), палитра растягивалась по высоте колонки |

## План 1.3

Согласован владельцем 2026-10-31: `lesson_blocks` — ядро, FK на `lessons` — в 2.1; пункт 1.14 «Настройки школы»
добавлен в роадмап. Хелперы `@dinastia/db` → пакет `@dinastia/blocks` (`defineBlock`, хранение, реестры, хосты) →
ядро `kernel/blocks` (load/save/copy, публикация) → `callout` → `pnpm gen:block` → тесты (БД, пакет, e2e песочницы) →
сверка `lesson-blocks`, `db-schema`, `core-kernel`, `settings`.

## План 1.12 и долга 1.11

Согласован владельцем 2026-10-31; демо — вариант 1 (песочница и тесты, продуктовое поле — с курсами).

A. Rate limit процедур: таблица `request_limits` (миграция), `rateLimit` middleware, scope задач `global` и очистка,
   лимиты на `schools.create`, приглашения, загрузку файлов; тесты, сверка `security-baseline`, `background-jobs`.
B. Rich text: профили и валидатор в `@dinastia/contracts` (без Tiptap), `toPlainText`/`isEmptyDoc`/`collectFileIds`,
   `toHtml` на сервере; `RichTextEditor` (Tiptap 3, лениво) и `RichTextView` (без innerHTML) в `@dinastia/ui`;
   виджет ресурса `richtext`; тесты валидатора, рендеров, совместимости редактора и валидатора; e2e песочницы;
   сверка `rich-text`, `admin-resource`.

## План 1.11

Согласован владельцем 2026-10-31 (вместе с белым списком встраиваний).

1. `pii()` в `@dinastia/db`: пометка колонки (флаг в config колонки), `isPii(column)`. Помечены: `users.name/email/image`,
   `sessions.ip_address/user_agent`, `consents.ip`, `invitations.email`, `files.name`, `audit_log.ip`. Тест-страж:
   ключ каждой pii-колонки маскируется в логах.
2. **Миграция**: `audit_log` (tenantTable; кто — участник или система, действие `<модуль>.<сущность>.<действие>`,
   сущность и id, `diff` opaqueJson, requestId, IP); `app_user` — без UPDATE/DELETE (REVOKE в миграции).
   `ctx.audit(action, { entity, id, diff? })` — в транзакции запроса; в задаче — актор «система».
3. Журнал в `schools`: смена роли, блокировка/разблокировка, приглашение сотрудника.
4. `ctx.http` (`kernel/http.ts`): node:http(s) с проверкой адреса при соединении (`lookup` — без окна DNS rebinding),
   IP-литералы и редиректы (до 3) — тоже; таймаут 10 с; повторы — только идемпотентные методы или с ключом
   идемпотентности, сеть/5xx/429; лог — метод, хост, статус, время.
5. **Миграция**: `webhook_events` (tenantTable, уникальны `school_id + provider + external_id`). Ядро: провайдер
   вебхуков `defineWebhookProvider` (подпись, разбор), обработчики модулей `defineWebhookHandler` →
   `defineModule({ webhooks })`; маршрут `POST /api/webhooks/<provider>/<schoolId>` → подпись (401) → запись (дубль —
   200) → задача `webhooks.process` → обработчик в транзакции школы, отметка processed. Фейковый провайдер (HMAC) —
   вне production.
6. `kernel/embed-allowlist.ts`: `embedProvider(url)` — YouTube, Rutube, VK Видео, Kinescope, Vimeo, Яндекс Формы,
   Google Forms; только https.
7. Тесты, сверка скиллов `security-baseline`, `integrations`, `personal-data`, `core-kernel`, `db-schema`.

Вне пункта: `rateLimit` middleware — сделан сразу следом (строка «1.11+» в ходе); экран журнала — с консолью/настройками школы; срок хранения `webhook_events`.

## План 1.7

1. Зависимость `apps/api`: S3-клиент (см. решения), `config`: `S3_*` из `.env.example`.
2. `kernel/storage/`: `defineFilePurpose(key, { maxSize, mime, perm })`, `files.createUpload` → presigned PUT (подписаны `content-type` и `content-length` — другой размер/тип S3 не примет), `files.complete` → HEAD объекта, сверка размера и типа, `status = ready`; `ctx.files.signedUrl(fileId, { ttl, download })`; ключ `schools/<schoolId>/<purpose>/<fileId>` строит ядро. Реестр назначений — `defineModule({ files })`.
3. **Миграция**: таблица `files` (tenantTable: `key` уникален, `purpose`, `name`, `mime`, `size`, `owner_member_id` → members, `status` pending/ready); `members.avatar_file_id` → files (set null).
4. Контракт `files.createUpload`, `files.complete` (право — из назначения); аватар: `schools.updateMyAvatar({ fileId | null })`, `avatarUrl` в `schools.me` и в списке сотрудников.
5. Задача ядра `files.cleanup` (all-schools, раз в час): `pending` старше 24 ч — удалить объект и строку.
6. UI: `ImageInput` в `packages/ui` (выбор, проверка размера/типа, загрузка с прогрессом, превью); экран «Профиль» с аватаром; аватар в меню пользователя и колонкой в «Сотрудниках» (`render: 'avatar'`).
7. Тесты: поток загрузки на SeaweedFS (presign → PUT → complete); чужой размер/тип — отказ; файл другой школы — не виден (RLS); signedUrl работает, без подписи — 403; очистка pending; e2e — загрузить аватар, увидеть в меню.
8. Сверка скиллов `files-media`, `admin-resource` (`render: 'avatar'`), `ui-kit`, `lms-school`, `core-kernel`, `db-schema`.

Вне пункта: превью картинок (`file_variants`, нужна библиотека обработки изображений) — с обложками курсов; видео (Kinescope) — с блоком video; квоты школы.

## План 1.8

1. Зависимости `apps/api`: `react-email` 6.11.3 (компоненты письма; `@react-email/components` помечен устаревшим), `@react-email/render` 2.1.1 (HTML + текстовая версия), `react`/`react-dom` из каталога; JSX в tsconfig api.
2. `kernel/mail/`: `defineEmail({ key, schema, subject(d, t), Component, examples })`, `EmailLayout` (название школы; логотип и цвет — с настройками школы), `renderEmail()` → тема, HTML, текст; транспорт SMTP/memory (как сейчас); реестр писем из модулей (`defineModule({ emails })`); строки — namespace `emails`.
3. `ctx.mail.send(email, { to, data })` в `BaseCtx`: проверка данных схемой и задача `mail.send` в транзакции запроса; отправитель — «<Школа> <адрес из SMTP_FROM>». В данных задачи — без секретов (лежат в БД открытым текстом).
4. Приглашение: `inviteStaff` больше не шлёт письмо и не создаёт рабочий токен — ставит задачу `schools.send-invitation { invitationId }`; задача выпускает токен (в БД — только хэш), рендерит письмо и отправляет его сама. Повтор задачи — новый токен и новое письмо (старая ссылка перестаёт работать); приглашение уже не pending — задача ничего не делает.
5. e2e: Playwright запускает API вместе с воркером (письмо приглашения теперь уходит из очереди).
6. `pnpm emails:preview` — HTML всех писем по `examples` в `apps/api/.emails/` (открыть в браузере).
7. Тесты: рендер (тема, ссылка, текстовая версия, экранирование данных); приглашение → задача → письмо со ссылкой, по ссылке принимается; повтор задачи — старая ссылка недействительна; откат транзакции — письма нет.
8. Сверка скиллов `notifications`, `lms-school`, `data-access` (временное исключение про синхронное письмо снимается), `background-jobs`, `core-kernel`.

Вне пункта: письмо magic link остаётся синхронным в auth (ядро, вход не ждёт очередь); предпочтения и отписка (`category`) — с первыми не транзакционными письмами; брендинг логотипом/цветом — с настройками школы.

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

1.11: `audit`, `http`, `webhooks`, `pii()`, белый список встраиваний — план пункта перед началом.
