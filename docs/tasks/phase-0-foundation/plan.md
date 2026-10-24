# План фазы 0

Версии сверены с npm 2026-10-24.

## Версии

| Пакет                                | Версия           | Примечание                                        |
| ------------------------------------ | ---------------- | ------------------------------------------------- |
| Node.js                              | 24.22.1 LTS      | `.nvmrc`                                          |
| pnpm                                 | 10.17 (corepack) | `packageManager` в корне                          |
| TypeScript                           | 7.0.2            | нативный компилятор (D-029)                       |
| turbo                                | 2.11             |                                                   |
| @biomejs/biome                       | 2.6              | линт + формат                                     |
| hono / @hono/node-server             | 4.13 / 2.1       |                                                   |
| @orpc/*                              | 1.16             | contract, server, client, openapi, tanstack-query |
| zod                                  | 4.6              |                                                   |
| drizzle-orm / drizzle-kit            | 0.45 / 0.31      | стабильная линия; 1.0 — ещё beta                  |
| pg                                   | 8.23             | драйвер для Drizzle и pg-boss                     |
| better-auth                          | 1.7              |                                                   |
| pg-boss                              | 12.38            | фаза 1                                            |
| react / vite                         | 19.3 / 8.3       |                                                   |
| @tanstack/react-router / react-query | 1.170 / 5.104    |                                                   |
| tailwindcss                          | 4.3              |                                                   |
| vitest / @playwright/test            | 5.0 / 1.64       |                                                   |
| pino                                 | 10.4             |                                                   |
| i18next / react-i18next              | 26 / 17          |                                                   |
| PostgreSQL (образ)                   | 18               | D-030                                             |

## 0.1 Монорепо

```
package.json            packageManager pnpm, scripts: dev, check, build, test, e2e, db:*, env:*, skills:link
pnpm-workspace.yaml     apps/*, packages/*, tools; catalog общих версий
turbo.json              typecheck, lint, test, build с кэшем
biome.json              правила, формат по D-031, запрет импорта глобального db-клиента в modules
tsconfig.base.json      strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ESM, paths
.nvmrc
packages/config/        общие tsconfig (node, react, library)
apps/api/               пустой Hono-сервер с /health/live
apps/web/               пустой Vite + React
packages/contracts/     пустой контракт
packages/db/            пустой пакет хелперов схемы (наполняется в 0.3)
tools/check/docs.ts     docs:check (шапки, ссылки, таблица скиллов) — заменяет ручную проверку
tools/src/skills-link.ts → pnpm skills:link
```

Проверка: `pnpm install && pnpm check` зелёный; `pnpm dev` поднимает api (:3000/health/live) и web (:5173).

## Отложено в следующие пункты

- lint-запрет импорта `#/kernel/db/client.ts` из `modules/**` — в 1.1, когда появятся модули (сейчас модулей нет).
- `pii()` — 1.11; `blockTable`/`settingsTable` — 1.3 и 1.6/настройки.
- `withTenant` из контекста процедуры (`ctx.db`) — 0.5.

## Ход

| Дата       | Пункт | Что                             |
| ---------- | ----- | ------------------------------- |
| 2026-10-24 | —     | задача создана, план согласован |
| 2026-10-24 | 0.1 | монорепо готово: pnpm 10.17 + catalog, turbo, Biome (табы/одинарные/без `;`), TS 7.0.2 strict, пакеты `config`, `contracts`, `db`, `api` (Hono, `/health/live` + тест), `web` (Vite 8 + React 19), `tools` (`docs:check`, `skills:link`). `pnpm check` зелёный, `pnpm dev` поднимает api :3000 и web :5173 |
| 2026-10-24 | 0.1 | находки: (1) 16 скиллов имели невалидную YAML-шапку (`: ` в description) — исправлено, правило в `skill-authoring`, ловит `docs:check`; (2) Biome 2.6 форматирует markdown и ломает frontmatter — `*.md` исключены из Biome; (3) базовый tsconfig перенесён в `packages/config` (резолв через symlink в vitest) |
| 2026-10-24 | 0.2 | `docker/compose.yml`: postgres:18.6 (роли `app_owner`/`app_user` без BYPASSRLS, default privileges, базы `dinastia`/`dinastia_test`), SeaweedFS 4.48 (S3 :8333, бакет создаётся идемпотентно), Mailpit 1.32; `.env.example`; `pnpm env:up/down/reset/logs/ps`. Проверено: DDL под `app_user` запрещён, DML на новые таблицы есть, `uuidv7()`, S3 только с подписью (неверный ключ — 403), CORS, SMTP → Mailpit; чистая установка через `env:reset` |
| 2026-10-24 | 0.3 | `@dinastia/db`: `schools` (корень тенанта, глобальная), `tenantTable` (id `uuidv7()`, `school_id` из `app.school_id`, даты, RLS + политика для `app_user`, `unique (school_id, id)`), `tenantRef` (составной FK), `richText`, `opaqueJson`, `appUser`. Ядро: `kernel/config` (zod, `.env`), `kernel/db/client` (пул `app_user`), `withTenant`, `admin` (migrate/reset под `app_owner`), `pnpm db:generate/migrate/reset/studio`, миграция `0000_init_schools`. Тесты на `dinastia_test` (globalSetup: reset + migrate): изоляция чтения/записи/изменения/удаления, вставка без школы — 42501, чужой `school_id` — 42501, ссылка на запись другой школы — 23503, школа не залипает на соединении; покрытие RLS всех таблиц с `school_id` + негативный тест. 9/9 |
| 2026-10-24 | 0.3 | находки: FK-проверки игнорируют RLS → составные FK (D-038); `pnpm <скрипт> -- --флаг` передаёт `--` буквально — в скиллах команды без `--` |
| 2026-10-24 | 0.4 | better-auth 1.7 (email+пароль, magic link 15 мин с хешем токена, rate limit в БД: вход/регистрация 5/мин, magic link 3/мин; id — `uuidv7()` БД; cookie на `.APP_DOMAIN`; телеметрия выключена). Таблицы `users` (`platform_role`), `sessions`, `accounts`, `verifications`, `rate_limits`, `consents`; модуль `schools`: `members` (RLS + политика «свои членства» только вне школы), `invitations` (хеш токена, частичный уникальный индекс pending по email). Сервисы: `createSchool` (школа + владелец + согласия), `listMySchools`, `findActiveMember`, `inviteStaff`/`getInvitation`/`acceptInvitation`. `kernel/host.ts`, `kernel/errors.ts` (`fail.*`), `kernel/mail.ts` (SMTP/memory), `pnpm db:seed`. Тесты 31/31 |
| 2026-10-24 | 0.4 | находки: (1) **дыра в моей же политике** — permissive-политики складываются через OR, членство в школе B давало роль в школе A; политика «свои членства» ограничена контекстом без школы, тест закрепляет; (2) **better-auth молча отключает origin/CSRF при NODE_ENV=test** — вход, изменение профиля по cookie и magic link на чужой callbackURL проходили с evil-origin; включено явно (D-040), тест-матрица; (3) тест покрытия RLS поймал `consents` — явное исключение с причиной; (4) вторая копия drizzle-orm после better-auth — peer-зависимость в `@dinastia/db` |

