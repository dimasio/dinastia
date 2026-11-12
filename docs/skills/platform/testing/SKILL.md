---
name: testing
description: Тесты Dinastia — unit на Vitest рядом с кодом (*.test.ts — чистые функции, grade, evaluate, toPublic, миграции блоков), интеграционные на реальном Postgres (фикстура withTestSchool с ролями, callAs(role, procedure, input), expectPermissionMatrix, изоляция школ, подмена времени), e2e-сценарии Playwright в tests/e2e (фикстуры школы и входа по роли, локаторы getByRole/getByTestId, соглашение data-testid <модуль>-<элемент>, сценарий фичи и демо фазы), запуск pnpm test / pnpm e2e, что тестировать обязательно. Использовать для «напиши тест», «проверь сценарий», «e2e», «тест прав» — аналог сценариев «Ариадны» rnd.
---

# Тесты

> Статус: сверено с кодом в фазе 0 и пункте 1.9 (фикстуры API и e2e).

Интеграционные тесты — на настоящей БД (D-015): RLS и SQL моками не проверяются.

## Что обязательно

| Изменение               | Тест                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| сервисная логика        | интеграционный: результат + побочные эффекты (события, задачи)                                         |
| процедура               | матрица прав: роли с правом — ок, без права — 403                                                      |
| политика «только свои»  | куратор/ученик не видит чужое (`notFound`)                                                             |
| новая тенантная таблица | RLS и политику проверяют `check:registries` и `rls-coverage.test` сами; в тесте сервиса — чужая школа не видит |
| блок / тип вопроса      | схема, `defaults`, `toPublic` без секретов, `evaluate`/`grade`; для блока — `save → load → copy` на БД |
| задача / подписчик      | выполнение + идемпотентность (двойной запуск)                                                          |
| фича с UI               | e2e-сценарий основного пути                                                                            |

## Unit

```ts
// packages/questions/src/multiple_choice/multiple_choice.test.ts
import { describe, it, expect } from 'vitest'
import { multipleChoice as q } from './definition'

describe('multiple_choice', () => {
  const data = q.parse({ …, correct: ['a', 'c'], scoring: 'partial', points: 2 })
  it('скрывает ответы', () => expect(q.toPublic(data)).not.toHaveProperty('correct'))
  it('частичный балл', () => expect(q.grade(data, { selected: ['a'] }).score).toBe(1))
})
```

## Интеграционные

Реальная БД `dinastia_test` (пересоздаётся перед прогоном). Основной способ — **через API от имени ролей**
(`apps/api/src/test/school.ts`, образец — `school.test.ts`):

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

it('приглашать сотрудников могут owner и admin', async () => {
	const t = await withTestSchool()                     // школа + участники всех 5 ролей
	expect((await t.as('teacher').schools.me()).member.role).toBe('teacher')   // типизированный клиент от имени роли
	await expect(t.as('guest').schools.me()).rejects.toMatchObject({ status: 401 })

	await expectPermissionMatrix(t, (c) => c.invitations.create({ email: `m-${Date.now()}@test.local`, role: 'curator' }), {
		allow: ['owner', 'admin'],
		deny: ['teacher', 'curator', 'student'],         // каждая роль — в allow или deny, иначе тест упадёт
	})
})
```

| Хелпер | Что |
|---|---|
| `withTestSchool(name?)` | школа, `people[role]` (`id`, `email`, `cookie`), `as(role \| 'guest' \| person)` → клиент, `cleanup()` |
| `clientFor(cookie, slug?)` | клиент API от имени сессии на хосте школы или корня |
| `expectPermissionMatrix(t, вызов, { allow, deny })` | deny — 403 `NO_PERMISSION`; allow — не 401/403 (бизнес-ошибки допустимы) |
| `call(method, path, { slug, cookie, body })`, `signUp()` (`test/http.ts`) | сырой HTTP (REST `/api/v1`, better-auth) |
| `startTestWorker()` / `stopTestWorker()`, `drainJobs()`, `jobStates(name)` (`test/jobs.ts`) | настоящий воркер pg-boss в тесте; дождаться выполнения задач и подписчиков (только очередей из реестра процесса — чужие пробные задачи не ждём; лимит 10 с, в ошибке — какие задачи ждут); состояния задач очереди (скилл `background-jobs`). Очередь — своя схема `pgboss_<n>` у каждого процесса (`test/setup.ts`): файлы идут параллельно, чужие задачи не выполняются |
| `lastMailTo(email)`, `inviteToken(email)` (`test/jobs.ts`) | выполнить очередь и взять последнее письмо на адрес (`memoryOutbox`) / токен приглашения из него |
| `createUser()`, `uniqueEmail()`, `uniqueSlug()` (`test/users.ts`) | данные с уникальными значениями |
| `memoryOutbox` (`kernel/mail/transport.ts`) | письма в тестах (`MAIL_TRANSPORT=memory`) |
| `withTenant(schoolId, fn, { userId })` | прямой доступ к БД школы — для подготовки данных и проверки сервисов без HTTP |
| `courseIn(schoolId)`, `lessonIn(schoolId)` (`test/courses.ts`) | настоящие курс и урок для тестов механизмов ядра: на них ссылаются внешние ключи `questions.course_id` и `lesson_blocks.lesson_id` |

Сервис без HTTP (правила, гонки) — вызов функции с `SchoolCtx`, собранным внутри `withTenant` (образец — `inSchool` в
`apps/api/src/modules/schools/schools.test.ts`). Подмена времени — через `now` в `SchoolCtx` (для HTTP — фаза 2, когда
понадобится).

## E2E (Playwright)

Фикстуры — `tests/e2e/fixtures.ts`: `import { expect, schoolUrl, test } from './fixtures.ts'`; `loginAs('teacher')`
(демо-роли `DEMO` из `pnpm db:seed`) или `loginAs({ email, password }, slug)` — вход через API из браузера, без формы.
Вход по паролю ограничен по IP (5/мин), а весь набор входит с 127.0.0.1 — Playwright поднимает API с
`AUTH_SIGN_IN_LIMIT=1000` (D-044). Каждый сценарий падает при нарушении CSP (фикстура `cspGuard` в `tests/e2e/fixtures.ts`, D-060) — для страниц контекста
сценария (`page`); новые контексты `browser.newContext()` не проверяются. Если API уже запущен через `pnpm dev`, его переиспользуют с лимитом 5 — сценарии
падают с 429: перезапустите API или задайте `AUTH_SIGN_IN_LIMIT` в `.env`.

Конфиг — `playwright.config.ts` (корень), сценарии — `tests/e2e/*.spec.ts`, демо фазы — `tests/e2e/phase-<N>.spec.ts`
(образец — `phase-0.spec.ts`). Playwright сам поднимает API и веб (`webServer`) или берёт уже запущенные; нужны
`pnpm env:up` и `pnpm db:seed` (демо-пользователи).

```ts
test('ученик попадает в /learn', async ({ page }) => {
	await page.goto('http://demo.dinastia.localhost:5173/')
	await expect(page).toHaveURL(/\/login$/)
	await page.getByTestId('auth-signin-email').fill('student1@demo.local')
	await page.getByTestId('auth-signin-password').fill('demo12345')
	await page.getByTestId('auth-signin-submit').click()
	await expect(page.getByRole('heading', { name: 'Мои курсы' })).toBeVisible()
})
```

- Локаторы: `getByRole`/`getByLabel` с доступным именем → `getByTestId` → никогда CSS-классы и XPath.
- `data-testid`: `<модуль>-<элемент>[-<id>]`.
- Письма (magic link, приглашения) — `waitForLink(email, /regex/)` из `tests/e2e/mailpit.ts` (API Mailpit).
- Уникальные данные на прогон (`Date.now().toString(36)` в email и slug): e2e идут по dev-БД.
- Dev-БД **копит** данные прогонов: не искать сидовые записи на первой странице списка — демо-курс открывать
  `openDemoCourse(page)` (`tests/e2e/fixtures.ts`, через поиск). Длинный сценарий — `test.setTimeout(90_000)`:
  в общем прогоне файлы идут в нескольких воркерах.
- **Запросы к `*.dinastia.localhost` — только из браузера** (`page.goto`, `page.evaluate(fetch…)`): Node на macOS
  не резолвит поддомены `localhost`, поэтому `page.request` к школе падает `ENOTFOUND`.
- macOS 13: Playwright не ставит свой Chromium — конфиг берёт установленный Google Chrome (`channel: 'chrome'`);
  в CI (Linux) — штатный Chromium (`npx playwright install --with-deps chromium`).
- Скриншоты для просмотра — `page.screenshot({ path: 'test-results/screens/<имя>.png', fullPage: true })`;
  проверяй глазами новые экраны, а не только зелёный тест.
- Ученик в e2e проверяет и API: ответ `learn.*` не содержит секретов (D-020) — с фазы 2.

## Запуск

| Команда | Что |
|---|---|
| `pnpm test` | все unit и интеграционные (Vitest, база `dinastia_test` пересоздаётся перед прогоном) |
| `pnpm test -- <фильтр>` | по имени файла (`pnpm test -- router.test`) |
| `pnpm e2e` | Playwright (поднимет API и веб сам) |
| `pnpm e2e -- <файл> --headed` | один сценарий в видимом браузере |
| `pnpm exec playwright show-trace test-results/<…>/trace.zip` | разбор упавшего e2e |

Хелперы интеграционных тестов сейчас: `apps/api/src/test/users.ts` (`createUser`, `uniqueEmail`, `uniqueSlug`),
`apps/api/src/test/http.ts` (`call(method, path, { slug, cookie, body })`, `signUp()`); письма в тестах —
`memoryOutbox` (`MAIL_TRANSPORT=memory`).

## Правила

Существующие тесты не ослаблять и не удалять ради прохождения — сообщить человеку. Флейки не «лечатся» ретраями:
найти причину (ожидание по событию, а не по времени).

- **Без DDL во время прогона.** Файлы идут параллельно: `CREATE`/`DROP` таблицы со ссылкой на `schools` взаимно
  блокируется с каскадным удалением школы в соседнем файле (deadlock). Пробная таблица для теста механизма ядра —
  в `apps/api/src/test/probes.ts` (теми же хелперами, что боевые); её создаёт global-setup после миграций, тест
  только импортирует.

- **Снимки экранов** — сценарии `@shots` с `shoot()` (`tests/e2e/shots.ts`, скилл `visual-review`); заодно ловят
  пропущенные строки i18n и горизонтальную прокрутку на 375px.
- **Плавающий тест** — `pnpm test:repeat` (скилл `debugging`), лог каждого падения сохраняется.

## Остановись и спроси, если

- тест падает на коде, который ты не менял;
- для теста нужна внешняя система (Kinescope, почта) — используй фейк ядра; нет фейка — запрос к ядру.
