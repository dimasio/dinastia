---
name: lms-courses
description: Курсы и контент в Dinastia — модуль courses — курс (draft/published/archived), разделы и уроки с порядком, блоки урока — строки lesson_blocks (state draft/published, block_key) и таблицы типов block_<type>, публикация урока и курса, правила доступа к уроку (open, sequential, drip) и завершения (view, all_blocks, manual), конструктор курса и урока, плеер ученика. Использовать для задач «добавь в курс/урок», «публикация», «последовательное открытие», «конструктор урока», «плеер урока».
---

# Курсы и контент

Правила — `docs/specs/domain.md` §3 «Курс и публикация», «Доступ к урокам», «Завершение урока».

## Где лежит

| Что                                                       | Где                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| таблицы `courses`, `sections`, `lessons`, `lesson_blocks` | `apps/api/src/modules/courses/schema.ts`                                                            |
| таблицы типов блоков `block_<type>`                       | `packages/blocks/src/<type>/table.ts`                                                               |
| публикация, порядок, копирование черновика                | `apps/api/src/modules/courses/service.ts`                                                           |
| вычисление доступности урока                              | `apps/api/src/modules/learning/service.ts` → `computeLessonAccess()` (доступ зависит от зачисления) |
| контракт                                                  | `packages/contracts/src/courses.ts`                                                                 |
| реестр курсов (ресурс)                                    | `apps/web/src/features/courses/resources/courses.ts`                                                |
| конструктор курса (дерево)                                | `apps/web/src/features/courses/builder/`                                                            |
| конструктор урока                                         | `apps/web/src/features/courses/lesson-editor/` (хост блоков из `packages/blocks`)                   |
| плеер урока                                               | `apps/web/src/features/learning/player/`                                                            |
| блоки                                                     | `packages/blocks/src/<type>/` (скилл `lesson-blocks`)                                               |

## Ключевые правила для кода

- Порядок разделов и уроков — `position` (целое с шагом 1000, перестановка — пересчёт соседей одной транзакцией).
- Ученику — только строки `state = published` через `toPublic()` типов; в `/learn` никогда не отдавать `draft`.
- Публикация урока (`publishLesson`, D-033): удалить `published`-строки урока, скопировать `draft` → `published`
  с теми же `block_key` (ядро копирует таблицы типов), `published_at = now()`, `has_unpublished_changes = false`,
  событие `lesson.published`. Любая правка черновика ставит `has_unpublished_changes = true`.
  Курс публикуется отдельно (`course.published`); урок неопубликованного курса ученик не видит.
- Стабильный ключ блока — `block_key` (не `id` строки: `id` у `draft` и `published` разные). На `(lesson_id,
  block_key)` ссылаются попытки, сдачи, `block_progress`. При дублировании урока `block_key` перевыпускаются.
- Удаление блока `quiz`/`assignment`, у которого есть попытки/сдачи, — 409 `BLOCK_HAS_RESPONSES`, UI спрашивает
  подтверждение и повторяет с `force: true` (ответы сохраняются; после публикации блок пропадает из плеера, `block_progress` по нему не учитывается в прогрессе).
- Права: `courses.read` (сотрудники), `courses.manage` (owner, admin, teacher), `courses.publish` (то же).

## Типовые задачи

| Задача                     | Как                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| новый вид контента в уроке | новый блок — скилл `lesson-blocks`                                                                                                  |
| новое поле курса           | `db-schema` (колонка `courses`), `api-endpoints`, ресурс `admin-resource`                                                           |
| новое правило доступа      | `change-workflow`; значение enum `access_mode` (+ колонки параметров), правило в `computeLessonAccess`, контракт, UI настроек урока |
| экран в конструкторе       | `web-screens` + `ui-kit`                                                                                                            |

## Остановись и спроси, если

- нужна история версий урока (сейчас только черновик/публикация, D-033);
- правка затрагивает уже опубликованные уроки с прогрессом учеников (пересчёт прогресса?).
