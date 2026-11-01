# Передача: 2026-11-01

Новая сессия начинает с: `AGENTS.md` → `task.md` → `plan.md` → этот файл. «династия» — продолжать отсюда.

## Где остановились

Фаза 2: 2.1–2.4 — **done**. Порядок дальше (plan.md): **2.5 «Публикация»** → 2.7 (обложки и медиа, блоки
«Картинка» и «Файл») → 2.4b (Kinescope) → 2.6 (плеер) → демо. Карточка
[`changes/2.5-publishing.md`](../changes/2.5-publishing.md) — шаги 1–3 готовы, **ждёт утверждения** (4 вопроса §3:
правка ядра `issues` в `defineBlock`, блокировать или пропускать пустые блоки, публикация курса, снятие с публикации).

## Состояние кода

`main`, 2.4 закоммичен, push не делался. Карточка 2.5 — не закоммичена (только доки). `pnpm check` зелёный, e2e 31.
Локальная БД — миграция `0009` применена.

## Следующий шаг

Ответы владельца → вписать в §3 карточки («Ответы», «Утверждено»), поправить §2–3 под ответы → шаг 4 по §2:
ядро (`issues`, `blockIssues`, `check:registries`) → `issues` у типов → `modules/courses/events.ts` → процедуры
`lessons.publish`, `publish`, `publishChanges` + `can('courses.publish')` → UI конструкторов → строки → тесты
(api + `tests/e2e/publishing.spec.ts`, `pnpm e2e:shots`) → §5 (`domain.md` §3, скилл `lms-courses`,
`lesson-blocks`) → §6 release notes → коммит.

## Открытые вопросы

См. `plan.md` «Открытые вопросы фазы» и §3 карточки 2.1.

## Не забыть

См. `docs/tasks/phase-1-registries/notes/handoff.md` «Не забыть» — всё в силе (Node 24, `env:check`, `gen:probe`,
`e2e:shots`, `test:repeat`, правки доков скриптом).
