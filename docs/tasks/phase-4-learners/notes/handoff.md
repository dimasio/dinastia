# Передача: 2026-11-11

Новая сессия начинает с: `AGENTS.md` → `task.md` → `plan.md` → этот файл. «династия» — продолжать отсюда.

## Где остановились

Фаза 4 — **принята и закрыта** (2026-11-11, демо `tests/e2e/phase-4.spec.ts` зелёное, e2e 63/63). Дальше — фаза 5: `docs/tasks/phase-5-launch/`
(её `notes/handoff.md`).

Демо-школа `trud` (`pnpm db:seed:trud`): 5 курсов, включая «Пожарная безопасность для работников организации» (с сертификатом:
4 выданы в конце сида, PDF печатает воркер `pnpm dev`), потоки с куратором `curator@trud.local`. Пересоздать базу: `pnpm env:reset && pnpm db:migrate && pnpm db:seed && pnpm db:seed:trud` (e2e засоряют базу).

## Состояние проверок

`pnpm check` зелёный. Полный e2e 63/63 с демо фазы (2026-11-11, при остановленном `pnpm dev` — Playwright поднимает свой сервер с
`AUTH_SIGN_IN_LIMIT=1000`). При запущенном владельцем `pnpm dev` полный прогон падает на лимите входов (429).

## Состояние кода

`main`, push не делался. Миграции до `0026_lesson_open_notices`. PDF — `kernel/documents` (Chromium: на macOS — установленный Google Chrome). Куратор видит только своих учеников (`learning/policies.ts`); тестам проверки
куратором нужен поток — `learning/testing.ts → intoCuratorGroup`, в e2e — `src/enroll.ts … <режим> curator@demo.local`.

## Не забыть

См. `docs/tasks/phase-1-registries/notes/handoff.md` «Не забыть» (Node 24, `env:check`, правки русских доков — скриптом через Write).
Плавающие e2e при полном прогоне (phase-3 «review-screen куратора») — не воспроизводятся поодиночке.
