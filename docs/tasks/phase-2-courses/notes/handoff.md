# Передача: 2026-11-01

Новая сессия начинает с: `AGENTS.md` → `task.md` → `plan.md` → этот файл. «династия» — продолжать отсюда.

## Где остановились

Фаза 2: 2.1 и **2.2 — done**. Следующий — **2.3 «Конструктор урока»**: список блоков урока, добавление из палитры
реестра, dnd, автосохранение черновика, предпросмотр. Механика есть с фазы 1: `kernel/blocks` (create/update/remove/
reorder/list), `BlockEditorHost`/`BlockViewerHost`/`BlockPalette` (`@dinastia/blocks/client`). Нужны процедуры
`courses.blocks.*` (контракт — модуль courses) и экран урока; пункт «Открыть урок (скоро)» в меню конструктора курса
— включить. Новая карточка `changes/2.3-lesson-editor.md`, шаги 1–3, **ждать утверждения**.

## Состояние кода

`main`, 2.2 закоммичен, push не делался. `pnpm check` зелёный, e2e 27.

## Следующий шаг

Карточка 2.3: §1 (роадмап 2.3, `lesson-blocks`, `lms-courses`), §2 архитектура (контракт `courses.blocks.list/create/
update/remove/reorder` поверх `kernel/blocks`, право `courses.manage`, `has_unpublished_changes = true` при правке;
экран `/admin/courses/$courseId/lessons/$lessonId`, шаблон «Конструктор» — палитра · холст · свойства, на мобиле — холст
+ Sheet), §3 вопросы владельцу (автосохранение и индикатор, предпросмотр — как увидит ученик, мобильный вид).

## Открытые вопросы

См. `plan.md` «Открытые вопросы фазы» и §3 карточки 2.1.

## Не забыть

См. `docs/tasks/phase-1-registries/notes/handoff.md` «Не забыть» — всё в силе (Node 24, `env:check`, `gen:probe`,
`e2e:shots`, `test:repeat`, правки доков скриптом).
