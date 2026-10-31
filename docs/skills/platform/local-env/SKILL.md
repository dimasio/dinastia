---
name: local-env
description: Локальное окружение Dinastia — требования (Node 24 через nvm и .nvmrc, pnpm через corepack, Docker), docker/compose.yml (PostgreSQL 18 с базами dinastia и dinastia_test и ролями app_owner/app_user, SeaweedFS как S3 с бакетом dinastia, Mailpit для почты), .env из .env.example, проверка готовности окружения pnpm env:check (версии, сервисы, миграции, демо-данные, порты — с командами исправления), команды pnpm env:up/down/reset/logs/ps, pnpm dev (api :3000, web :5173), адреса и доступы, проверка сервисов, типичные проблемы; демо-данные pnpm db:seed. Использовать для «разверни/запусти проект», «не стартует», «сбрось базу/окружение», «демо-данные», «где письма», «где файлы».
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
`drizzle-kit` не понимает импорты `#/…`), `.env` полон, Docker и сервисы healthy, миграции применены, демо-данные
есть, порты 3000/5173 свободны, Chrome для e2e. На каждую проблему печатает команду исправления; код 1 — есть
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

Затем: `pnpm db:migrate` (схема) и `pnpm db:seed` (демо-данные); `pnpm env:check` — всё ли готово.

## Сервисы

| Что | Адрес | Доступ |
|---|---|---|
| API | http://localhost:3000, `/health/live` | — |
| веб | корень — http://dinastia.localhost:5173, школа — http://demo.dinastia.localhost:5173 (D-041) | см. «Демо-данные» |
| PostgreSQL 18 | `localhost:5432`, базы `dinastia`, `dinastia_test` | приложение — `app_user`/`app_user`; миграции — `app_owner`/`app_owner`; суперпользователь — `postgres`/`postgres` (только для отладки) |
| S3 (SeaweedFS) | http://localhost:8333, бакет `dinastia`, path-style | ключ `dinastia` / `dinastia-secret`; UI файлов — http://localhost:8888 |
| Mailpit (письма, magic link) | http://localhost:8025, SMTP `localhost:1025` | — |

`*.localhost` резолвится браузерами в 127.0.0.1 сам; для curl — `http://127.0.0.1:3000/...` с
`-H 'Host: demo.dinastia.localhost:5173'` и для POST — `-H 'Origin: http://demo.dinastia.localhost:5173'`.
Сессия — cookie на `.dinastia.localhost`: один вход на корне и во всех школах.

## Роли БД (D-006)

| Роль | Может | Для чего |
|---|---|---|
| `app_owner` | владелец баз и схемы `public`, DDL | миграции (`DATABASE_URL_OWNER`) |
| `app_user` | только DML (`select/insert/update/delete`) на таблицы `app_owner` — выдаётся автоматически (default privileges); без DDL, **без `BYPASSRLS`** | приложение и тесты (`DATABASE_URL`, `DATABASE_URL_TEST`) |

Роли и базы создаёт `docker/postgres/init.sh` при **первом** старте тома. Поменяли `init.sh` — `pnpm env:reset`.

## Команды

| Команда | Что |
|---|---|
| `pnpm env:check` | готово ли окружение (версии, `.env`, сервисы, миграции, демо-данные, порты) — с командами исправления |
| `pnpm env:up` | поднять сервисы и дождаться healthy; создать бакет (идемпотентно) |
| `pnpm env:down` | остановить (данные сохраняются) |
| `pnpm env:reset` | **удалить данные** (тома) и поднять заново — только локально |
| `pnpm env:logs` / `env:ps` | логи / состояние контейнеров |
| `pnpm dev` | api (tsx watch) + web (vite) |
| `pnpm e2e` | e2e-сценарии Playwright (нужны `env:up` и `db:seed`) |
| `pnpm db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:generate --name <что>` | миграции (под `app_owner`), сброс локальной БД, демо-данные, Drizzle Studio, новая миграция |
| фаза 1: `pnpm jobs:list` | очереди задач |

## Проверить, что всё работает

```bash
pnpm env:check                                        # всё сразу, с подсказками
pnpm env:ps                                           # все (healthy)
curl -s localhost:3000/health/live                    # {"status":"ok"} (при pnpm dev)
docker exec -e PGPASSWORD=app_user dinastia-postgres-1 psql -h localhost -U app_user -d dinastia -tAc 'select uuidv7()'
curl -s --aws-sigv4 'aws:amz:ru-central1:s3' --user 'dinastia:dinastia-secret' 'http://localhost:8333/dinastia?list-type=2' | head -c 200
```

## Демо-данные

`pnpm db:seed` (идемпотентен; `apps/api/src/seed.ts`, идёт через сервисы): пароль у всех — `demo12345`.

| Школа | Пользователи |
|---|---|
| `demo` | `owner@demo.local`, `admin@demo.local`, `teacher@demo.local`, `curator@demo.local`, `student1@demo.local` … `student5@demo.local` |
| `other` (проверка изоляции) | `owner@other.local`; `teacher@demo.local` — здесь ученик (один человек — разные роли) |

С фазы 2 — демо-курс с уроками всех блоков, тестом и заданием, потоком и прогрессом. Новая сущность → дополни сид
в той же задаче. Письма (magic link, приглашения) — в Mailpit.

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
| вход отвечает 403 `Invalid origin` | запрос не с `*.dinastia.localhost` (или без заголовка `Origin` у curl) |

## Остановись и спроси, если

- нужны данные или доступы прод/стейдж окружения;
- compose не поднимается из-за ограничений машины (ресурсы, корпоративный прокси);
- нужен новый сервис в compose (Redis, …) — это изменение окружения, согласуй.
