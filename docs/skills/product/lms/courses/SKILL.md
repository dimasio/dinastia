---
name: lms-courses
description: Курсы и контент в Dinastia — модуль courses: курс (draft/published/archived), разделы и уроки с порядком, блоки урока в draft_blocks/published_blocks, публикация урока и курса, правила доступа к уроку (open, sequential, drip) и завершения (view, all_blocks, manual), конструктор курса и урока, плеер ученика. Использовать для задач «добавь в курс/урок», «публикация», «последовательное открытие», «конструктор урока», «плеер урока».
---

# Курсы и контент

Правила — `docs/specs/domain.md` §3 «Курс и публикация», «Доступ к урокам», «Завершение урока».

## Где лежит

| Что | Где |
|---|---|
| таблицы `courses`, `sections`, `lessons` | `apps/api/src/modules/courses/schema.ts` |
| публикация, порядок, копирование черновика | `apps/api/src/modules/courses/service.ts` |
| вычисление доступности урока | `apps/api/src/modules/learning/service.ts` → `computeLessonAccess()` (доступ зависит от зачисления) |
| контракт | `packages/contracts/src/courses.ts` |
| реестр курсов (ресурс) | `apps/web/src/features/courses/resources/courses.ts` |
| конструктор курса (дерево) | `apps/web/src/features/courses/builder/` |
| конструктор урока | `apps/web/src/features/courses/lesson-editor/` (хост блоков из `packages/blocks`) |
| плеер урока | `apps/web/src/features/learning/player/` |
| блоки | `packages/blocks/src/<type>/` (скилл `lesson-blocks`) |

## Ключевые правила для кода

- Порядок разделов и уроков — `position` (целое с шагом 1000, перестановка — пересчёт соседей одной транзакцией).
- Ученику — только `published_blocks` через `toPublicBlocks()`; в `/learn` никогда не отдавать `draft_blocks`.
- Публикация урока: `draft_blocks → published_blocks`, `published_at = now()`, событие `lesson.published`.
  Курс публикуется отдельно (`course.published`); урок неопубликованного курса ученик не видит.
- Каждый блок имеет стабильный `id` (uuid) — на него ссылаются попытки, ДЗ и состояние блока в `lesson_progress`.
  При дублировании урока `id` блоков перевыпускаются.
- Удаление блока `quiz`/`assignment`, у которого есть попытки/сдачи, — 409 `BLOCK_HAS_RESPONSES`, UI спрашивает
  подтверждение и повторяет с `force: true` (ответы сохраняются, блок помечается удалённым в `lesson_progress`).
- Права: `courses.read` (сотрудники), `courses.manage` (owner, admin, teacher), `courses.publish` (то же).

## Типовые задачи

| Задача | Как |
|---|---|
| новый вид контента в уроке | новый блок — скилл `lesson-blocks` |
| новое поле курса | `db-schema` (колонка или `settings`), `api-endpoints`, ресурс `admin-resource` |
| новое правило доступа | `change-workflow`; правило в `computeLessonAccess`, схема `access` в контракте, UI настроек урока |
| экран в конструкторе | `web-screens` + `ui-kit` |

## Остановись и спроси, если

- нужна история версий урока (сейчас только черновик/публикация, D-019);
- правка затрагивает уже опубликованные уроки с прогрессом учеников (пересчёт прогресса?).
