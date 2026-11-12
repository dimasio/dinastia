---
name: local-env
description: Локальное окружение Dinastia — требования (Node 24 через nvm и .nvmrc, pnpm через corepack, Docker), docker/compose.yml (PostgreSQL 18 с базами dinastia, dinastia_test, dinastia_e2e и ролями app_owner/app_user, SeaweedFS как S3 с бакетом dinastia, Mailpit для почты и отдельный Mailpit e2e), .env из .env.example, проверка готовности окружения pnpm env:check (версии, сервисы, миграции, данные центра, порты — с командами исправления), команды pnpm env:up/down/reset/logs/ps, pnpm dev (api :3000, web education.localhost:5173), адреса и доступы, данные pnpm db:seed (учебный центр АИР «Горизонт», курс по первой помощи, пользователи), отдельный контур e2e (база dinastia_e2e, Mailpit :8026, порты 3100/5174), проверка сервисов, типичные проблемы. Использовать для «разверни/запусти проект», «не стартует», «сбрось базу/окружение», «какие логины», «где письма», «где файлы».
---

# Локальное окружение

> Статус: сверено с кодом в фазе 0 (пункты 0.2–0.4), кроме разделов с пометкой «фаза N».

Работаем **только** с локальными сервисами; к продовым БД и хранилищам не подключаться.

## Требования

| Что | Как |
|---|---|
| Node.js 24 LTS | `nvm install` (берёт версию из `.nvmrc`), затем `nvm use` в каждом новом терминале |
| pnpm 10 | `corepack enable` (версия — `packageManager` в `package.json`) |
| Docker | Docker Desktop / OrbStack, запущен |

## Начало сессии

`pnpm env:check` — одна команда: Node и pnpm нужных версий (Node из `.nvmrc`; под другой версией
`drizzle-kit` не понимает импорты `#/…`), `.env` полон, Docker и сервисы healthy, миграции применены, центр
засеян, порты 3000/5173 свободны, Chrome для e2e. На каждую проблему печатает команду исправления; код 1 — есть
блокеры. Запускать в начале работы и когда «что-то не стартует». В оболочке агента Node по умолчанию может быть не
тот: `source ~/.nvm/nvm.sh && nvm use` в той же команде, что и `pnpm …`.

## Первый запуск

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env        # значения по умолчанию подходят для compose
pnpm env:up                 # Postgres, SeaweedFS, Mailpit + создание бакета; ждёт healthy
pnpm dev                    # api + воркер задач (один процесс, src/dev.ts) + web
```

Затем: `pnpm db:migrate` (схема) и `pnpm db:seed` (учебный центр АИР «Горизонт»); `pnpm env:check` — всё ли готово.

## Сервисы

| Что | Адрес | Доступ |
|---|---|---|
| API | http://localhost:3000, `/health/live` | — |
| веб | корень и консоль `/ops` — http://education.localhost:5173, центр — http://airgorizont.education.localhost:5173 (D-041, D-068) | см. «Данные» |
| PostgreSQL 18 | `localhost:5432`, базы `dinastia` (dev), `dinastia_test` (тесты API), `dinastia_e2e` (e2e) | приложение — `app_user`/`app_user`; миграции — `app_owner`/`app_owner`; суперпользователь — `postgres`/`postgres` (только для отладки) |
| S3 (SeaweedFS) | http://localhost:8333, бакет `dinastia`, path-style | ключ `dinastia` / `dinastia-secret`; UI файлов — http://localhost:8888 |
| Mailpit (письма, magic link) | http://localhost:8025, SMTP `localhost:1025`; e2e — http://localhost:8026, SMTP `:1026` | — |

`*.localhost` резолвится браузерами в 127.0.0.1 сам; для curl — `http://127.0.0.1:3000/...` с
`-H 'Host: airgorizont.education.localhost:5173'` и для POST — `-H 'Origin: http://airgorizont.education.localhost:5173'`.
Сессия — cookie на `.education.localhost`: один вход на корне и во всех центрах. Домен из одного слова (`localhost`)
не подходит: cookie на `Domain=localhost` браузеры не принимают (D-068).

## Роли БД (D-006)

| Роль | Может | Для чего |
|---|---|---|
| `app_owner` | владелец баз и схемы `public`, DDL | миграции (`DATABASE_URL_OWNER`) |
| `app_user` | только DML (`select/insert/update/delete`) на таблицы `app_owner` — выдаётся автоматически (default privileges); без DDL, **без `BYPASSRLS`** | приложение и тесты (`DATABASE_URL`, `DATABASE_URL_TEST`) |

Роли и базы создаёт `docker/postgres/init.sh` при **первом** старте тома. Поменяли `init.sh` — `pnpm env:reset`.

## Команды

| Команда | Что |
|---|---|
| `pnpm env:check` | готово ли окружение (версии, `.env`, сервисы, миграции, данные центра, порты) — с командами исправления |
| `pnpm env:up` | поднять сервисы и дождаться healthy; создать бакет (идемпотентно) |
| `pnpm env:down` | остановить (данные сохраняются) |
| `pnpm env:reset` | **удалить данные** (тома) и поднять заново — только локально |
| `pnpm env:logs` / `env:ps` | логи / состояние контейнеров |
| `pnpm dev` | api (tsx watch) + web (vite) |
| `pnpm e2e` | e2e-сценарии Playwright в своём контуре (нужен `env:up`; база e2e засевается сама) |
| `pnpm db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:generate --name <что>` | миграции (под `app_owner`), сброс локальной БД, данные центра, Drizzle Studio, новая миграция |
| `pnpm jobs:list` / `jobs:run <имя>` | очереди задач / выполнить задачу сейчас (скилл `background-jobs`) |

## Проверить, что всё работает

```bash
pnpm env:check                                        # всё сразу, с подсказками
pnpm env:ps                                           # все (healthy)
curl -s localhost:3000/health/live                    # {"status":"ok"} (при pnpm dev)
docker exec -e PGPASSWORD=app_user dinastia-postgres-1 psql -h localhost -U app_user -d dinastia -tAc 'select uuidv7()'
curl -s --aws-sigv4 'aws:amz:ru-central1:s3' --user 'dinastia:dinastia-secret' 'http://localhost:8333/dinastia?list-type=2' | head -c 200
```

## Данные: учебный центр АИР «Горизонт»

`pnpm db:seed` (`apps/api/src/seed.ts` → `seed/airgorizont.ts`, через сервисы): учебный центр `airgorizont` —
http://airgorizont.education.localhost:5173. Демо-школ в dev нет. Центр уже есть — сид ничего не делает; пересоздать:
`pnpm db:reset && pnpm db:seed`. Писем сид не шлёт. Пароль у всех — `gorizont2026`.

| Роль | Почта | Кто |
|---|---|---|
| владелец | `kornev@airgorizont.local` | Корнев Денис Александрович |
| администратор | `tikhomirov@airgorizont.local` | Тихомиров Дмитрий Сергеевич |
| куратор | `ivanov@airgorizont.local` | Иванов Иван Иванович — куратор учебной группы |
| слушатель | `tikhomirova@airgorizont.local` | Тихомирова Анастасия Ильинична — зачислена в группу, прогресса нет |
| оператор `/ops` | `ops@airgorizont.local` | отдельная учётная запись; второй фактор включает при первом входе |

Курс «Оказание первой помощи пострадавшим при наружных кровотечениях, ранениях и травмах» (`seed/first-aid.ts`, по
приказам Минздрава № 220н и № 1331н, постановлениям № 2464 и № 805): 7 разделов, 31 тема, последовательный доступ
60 дней; банк из 42 вопросов всех 7 типов с тегами по разделам; тест после каждого раздела (в разделе 3 — развёрнутый ответ
с проверкой куратором), практическое задание раздела 3 (срок 14 дней), итоговый тест (20 случайных вопросов, 80%) и
итоговое задание (срок 21 день); удостоверение с подписью владельца; оформление — цвета airgorizont.ru. Ключ ответов —
там же, им пользуется e2e `first-aid.spec`. Новая возможность продукта → дополни сид в той же задаче.

Новая школа для разработки (публичной регистрации нет, 5.6): `pnpm --filter @dinastia/api exec tsx src/create-school.ts <slug>
<название> <email владельца> <пароль>`; оператор — `pnpm ops:grant <email>` (печатает разовый пароль, если пользователя не было).

## Контур e2e

`pnpm e2e` не трогает dev: своя база `dinastia_e2e`, свой Mailpit (http://localhost:8026, SMTP `:1026`), API `:3100`,
веб http://dinastia.localhost:5174 (`tests/e2e/env.ts`). Перед прогоном Playwright пересоздаёт базу и засевает её
`e2e:prepare` (`src/test/seed-e2e.ts`: школы `demo` и `other` для сценариев — пароль `demo12345`, плюс тот же АИР «Горизонт»).
Можно гонять при запущенном `pnpm dev`. Почистить письма dev — `curl -X DELETE localhost:8025/api/v1/messages`.

## Типичные проблемы

| Симптом | Что делать |
|---|---|
| `Cannot connect to the Docker daemon` | запустить Docker Desktop |
| `EADDRINUSE :3000` или API отвечает «по-старому» (404 на новые маршруты) | на порту висит прежний процесс node (убили обёртку `tsx`/`pnpm`, а не node): `lsof -tiTCP:3000 -sTCP:LISTEN \| xargs kill` (так же для 5173) |
| `ECONNREFUSED 5432` / `8333` | `pnpm env:up`, `pnpm env:ps` |
| порт занят | поменять в `.env` (`DB_PORT`, `S3_PORT`, `API_PORT`, `WEB_PORT`, …) и в URL там же |
| `permission denied for schema public` | DDL под `app_user` — DDL только миграциями под `app_owner` |
| `permission denied for table` / пустые выборки | запрос не через `ctx.db` или не установлен тенант — скилл `data-access` |
| роли/базы не те после правки `init.sh` | `pnpm env:reset` |
| magic link не приходит | Mailpit http://localhost:8025 |
| `node: command not found` / не та версия | `nvm use` |
| схема разошлась после смены ветки | `pnpm db:reset && pnpm db:seed` |
| все получают 429 на входе после 5 ошибок у одного | `TRUST_PROXY_HOPS` в `.env` не совпадает со схемой (через Vite — 1, напрямую к :3000 — 0) |
| вход отвечает 403 `Invalid origin` | запрос не с `*.education.localhost` (или без заголовка `Origin` у curl) |
| после входа снова форма входа | в `.env` старый `APP_DOMAIN` (`dinastia.localhost` или `localhost`) — нужен `education.localhost`, перезапустить `pnpm dev` |

## Остановись и спроси, если

- нужны данные или доступы прод/стейдж окружения;
- compose не поднимается из-за ограничений машины (ресурсы, корпоративный прокси);
- нужен новый сервис в compose (Redis, …) — это изменение окружения, согласуй.
