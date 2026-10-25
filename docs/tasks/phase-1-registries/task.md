---
status: active
area: core
phase: 1
created: 2026-10-24
closed:
---

# Фаза 1. Низкий код: реестры и генераторы

Цель — инструменты, которыми дальше строятся все фичи людьми и агентами. Роадмап — `docs/plan/roadmap.md` → «Фаза 1»,
ход — [plan.md](plan.md).

**Демо (критерий готовности):** агент по скиллу генерирует новый ресурс и новый блок без правок ядра; e2e
`tests/e2e/phase-1.spec.ts` зелёный.

## Пункты

Порядок выполнения: 1.1 → 1.9 (тест-фикстуры нужны дальше) → 1.2 → 1.6 → 1.8 → 1.7 → 1.11 → 1.12 → 1.3 → 1.4 → 1.5 →
1.13 — так зависимости идут раньше зависящих (почта через задачи, блоки на rich text и файлах).

| # | Пункт | Статус |
|---|---|---|
| 1.1 | `defineModule`, реестр модулей, меню из фич (`nav.ts`), `pnpm gen:module`, lint-запрет глобального клиента БД в модулях | done |
| 1.2 | Ресурс-фреймворк `defineResource` + `ResourceTable/Form/Page`, `listQuery`/`toPage`, `pnpm gen:resource`; экран «Сотрудники школы» | done |
| 1.3 | `@dinastia/db` `blockTable`; реестр блоков, публикация строками, `pnpm gen:block`; демо-блок `callout` | backlog |
| 1.4 | Реестр вопросов поверх `questions`/`question_items`, ревизии, `pnpm gen:question`; демо `single_choice` | backlog |
| 1.5 | `check:registries` | backlog |
| 1.6 | События (outbox) и задачи (pg-boss), воркер | done |
| 1.7 | Файлы: S3, presigned upload, `files` | backlog |
| 1.8 | Почта: `defineEmail`, очередь (приглашение — через неё) | backlog |
| 1.9 | Тест-фикстуры `withTestSchool`/`callAs`/`expectPermissionMatrix`, e2e-фикстуры | done |
| 1.11 | `audit`, `http`, `webhooks`, `pii()`, белый список встраиваний | backlog |
| 1.12 | Rich text: `RichText`, профили, редактор/просмотр | backlog |
| 1.13 | Сверка скиллов фазы 1 | backlog |

## Решения

| Дата | Решение |
|---|---|
| 2026-10-25 | D-043: ресурс-фреймворк на TanStack Table 9, состояние списка в адресе, `ResourceProvider` |
| 2026-10-25 | D-044: `AUTH_SIGN_IN_LIMIT` вне production — e2e-набор упирался в лимит входов |
| 2026-10-25 | D-045: outbox событий — задачи pg-boss в транзакции запроса, без отдельной таблицы (решение владельца) |
