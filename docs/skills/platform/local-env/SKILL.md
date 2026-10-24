---
name: local-env
description: Локальное окружение Dinastia — требования (Node 24, pnpm, Docker), docker compose (Postgres 17 с базами dev и test, MinIO для S3, Mailpit для почты), .env из .env.example, pnpm install, pnpm db:reset и db:seed (демо-школа demo с пользователями всех ролей), pnpm dev (api, web, воркер), адреса http://demo.localhost:5173, API :3000, Mailpit :8025, MinIO :9001, типичные проблемы. Использовать для «разверни/запусти проект», «не стартует», «сбрось базу», «демо-данные», «где письма».
---

# Локальное окружение

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.2).

Работаем **только** с локальными сервисами; к продовым БД и хранилищам не подключаться.

## Требования

Node.js 24 LTS (`.nvmrc`), pnpm (через `corepack enable`), Docker Desktop / OrbStack.

## Первый запуск

```bash
corepack enable
pnpm install
cp .env.example .env                 # значения по умолчанию подходят для compose
pnpm env:up                          # docker compose -f docker/compose.yml up -d
pnpm db:reset                        # создать dev-базу, роли app_owner/app_user, миграции
pnpm db:seed                         # демо-школа
pnpm dev                             # api + web + воркер задач
```

## Сервисы

| Что | Адрес | Доступ |
|---|---|---|
| кабинет демо-школы | http://demo.localhost:5173 | см. пользователей ниже |
| корневой домен (регистрация школы) | http://localhost:5173 | — |
| API, OpenAPI | http://localhost:3000, `/api/openapi.json` | — |
| Postgres | `localhost:5432`, базы `dinastia`, `dinastia_test` | `app_owner` / `app_owner` |
| Mailpit (письма, magic link) | http://localhost:8025 | — |
| MinIO (S3) | http://localhost:9001 | `minio` / `minio12345` |

`*.localhost` резолвится браузерами в 127.0.0.1 сам; для curl — `-H 'Host: demo.localhost'`.

## Демо-данные (`pnpm db:seed`)

Школа `demo`; пароль у всех — `demo12345`: `owner@demo.local`, `admin@demo.local`, `teacher@demo.local`,
`curator@demo.local`, `student1@demo.local` … `student5@demo.local`. Курс «Демо-курс» с разделами, уроками всех
блоков, тестом и ДЗ, поток с куратором, ученики с разным прогрессом. Вторая школа `other` — для проверки изоляции.

Сид — код в `tools/seed/`; новая сущность MVP → дополни сид в той же задаче.

## Команды

| Команда | Что |
|---|---|
| `pnpm env:up` / `env:down` / `env:logs` | сервисы compose |
| `pnpm db:reset` | пересоздать dev-базу и применить миграции (данные удаляются) |
| `pnpm db:migrate` | применить новые миграции |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm jobs:list` | очереди задач |

## Типичные проблемы

| Симптом | Что делать |
|---|---|
| `ECONNREFUSED 5432` | `pnpm env:up`, проверить `docker ps` |
| `permission denied for table` / пустые выборки | запрос не через `ctx.db` или не установлен тенант — скилл `data-access` |
| magic link не приходит | Mailpit http://localhost:8025 |
| порт занят | поменять в `.env` (`API_PORT`, `WEB_PORT`) |
| схема разошлась после смены ветки | `pnpm db:reset && pnpm db:seed` |

## Остановись и спроси, если

- нужны данные или доступы прод/стейдж окружения;
- compose не поднимается из-за ограничений машины (ресурсы, корпоративный прокси).
