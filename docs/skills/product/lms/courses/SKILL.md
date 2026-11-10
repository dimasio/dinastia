---
name: lms-courses
description: Курсы и контент в Dinastia — модуль courses — курс (draft/published/archived), разделы и уроки с порядком, блоки урока — строки lesson_blocks (state draft/published, block_key) и таблицы типов block_<type>, публикация урока и курса, правила доступа к уроку (open, sequential, drip) и завершения (view, all_blocks, manual), конструктор курса и урока, плеер ученика. Использовать для задач «добавь в курс/урок», «публикация», «последовательное открытие», «конструктор урока», «плеер урока».
---

# Курсы и контент

Правила — `docs/specs/domain.md` §3 «Курс и публикация», «Доступ к урокам», «Завершение урока».

## Где лежит

| Что                                                       | Где                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| таблицы `courses`, `sections`, `lessons`                  | `apps/api/src/modules/courses/schema.ts` (`lesson_blocks` — ядро, `@dinastia/db`; внешние ключи на `lessons`/`courses` — миграция `0008`, D-054) |
| таблицы типов блоков `block_<type>`                       | `packages/blocks/src/<type>/table.ts`                                                               |
| курсы, разделы, уроки: адрес, порядок, архив, удаление    | `apps/api/src/modules/courses/service.ts` (+ `slug.ts`) |
| публикация урока, курса, «Опубликовать изменения»          | `apps/api/src/modules/courses/publish.service.ts` поверх `kernel/blocks` (`publishBlocks`, `draftIssues`); события — `events.ts`; статус урока — `lessonStatus()` в контракте; бейдж и разбор ошибок — `apps/web/src/features/courses/publish.tsx` |
| обложка курса, медиа урока                                | назначения — `modules/courses/files.ts`; обложка — `updateCourse` (`coverFileId`, прежний файл удаляется), `coverUrl` в `getCourse`; файлы блоков — `checkNewFiles` в `blocks.service.ts`; экран — `ImageInput preview="wide"` в конструкторе курса |
| вычисление доступности урока                              | `apps/api/src/modules/learning/access.ts` → `computeAccess()` (чистая функция; D-057) (доступ зависит от зачисления) |
| контракт                                                  | `packages/contracts/src/courses.ts`                                                                 |
| реестр курсов (ресурс)                                    | `apps/web/src/features/courses/resources/courses.ts`, маршрут `/admin/courses`, меню «Контент → Курсы» |
| конструктор курса (дерево)                                | `apps/web/src/features/courses/builder/course-builder.tsx`, маршрут `/admin/courses/$courseId` (dnd-kit: перетаскивание + меню «Выше/Ниже/В раздел…») |
| конструктор урока                                         | `apps/web/src/features/courses/lesson-editor/lesson-editor.tsx`, маршрут `/admin/courses/$courseId/lessons/$lessonId` (файл `$courseId_.lessons.$lessonId.tsx`); API — `modules/courses/blocks.service.ts` поверх `kernel/blocks` (любая правка → `has_unpublished_changes`) |
| плеер урока                                               | `apps/web/src/features/learning/player/`                                                            |
| блоки                                                     | `packages/blocks/src/<type>/` (скилл `lesson-blocks`)                                               |

## Ключевые правила для кода

- Порядок разделов и уроков — `position` (целое с шагом 1000, перестановка — пересчёт соседей одной транзакцией).
- Ученику — только строки `state = published` через `toPublic()` типов; в `/learn` никогда не отдавать `draft`.
- Публикация урока (`publishLesson`, D-033): удалить `published`-строки урока, скопировать `draft` → `published`
  с теми же `block_key` (ядро копирует таблицы типов), `published_at = now()`, `has_unpublished_changes = false`,
  событие `lesson.published`. Любая правка черновика ставит `has_unpublished_changes = true`. Блоки с замечаниями
  (`issues` типа) — `LESSON_HAS_ISSUES` (`data.blocks`), без блоков — `LESSON_EMPTY`.
  Курс публикуется отдельно (`publishCourse`, нужен опубликованный урок, журнал, `course.published`); урок
  неопубликованного курса ученик не видит. `publishCourseChanges` — все изменённые уроки или ни одного
  (`COURSE_LESSONS_HAVE_ISSUES`, `data.lessons`).
- Стабильный ключ блока — `block_key` (не `id` строки: `id` у `draft` и `published` разные). На `(lesson_id,
  block_key)` ссылаются попытки, сдачи, `block_progress`. При дублировании урока `block_key` перевыпускаются.
- (фаза 3, ещё не сделано) Удаление блока `quiz`/`assignment`, у которого есть попытки/сдачи, — 409 `BLOCK_HAS_RESPONSES`, UI спрашивает
  подтверждение и повторяет с `force: true` (ответы сохраняются; после публикации блок пропадает из плеера, `block_progress` по нему не учитывается в прогрессе).
- Права: `courses.read` (owner, admin, teacher, curator), `courses.manage` (owner, admin, teacher), `courses.publish`
  (то же). Куратор видит, но не правит.
- Адрес курса — `slugify(title)` + `nextFreeSlug` (`slug.ts`), меняется только у черновика (`COURSE_SLUG_LOCKED`).
- Удаление — только черновик без уроков; иначе архив (`archiveCourse`, журнал действий).
- Тесты модуля — `modules/courses/courses.test.ts`, `blocks.test.ts`, `publish.test.ts`, `media.test.ts` (на SeaweedFS); e2e — `tests/e2e/publishing.spec.ts`, `media.spec.ts`; курс и урок для тестов механизмов ядра — `test/courses.ts`.

## Типовые задачи

| Задача                     | Как                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| новый вид контента в уроке | новый блок — скилл `lesson-blocks`                                                                                                  |
| новое поле курса           | `db-schema` (колонка `courses`), `api-endpoints`, ресурс `admin-resource`                                                           |
| новое правило доступа      | `change-workflow`; значение enum `access_mode` (+ колонки параметров), правило в `computeAccess` (`learning/access.ts`), контракт `courses.lessons.update`, UI — `features/courses/access.tsx` (`LessonAccess`, `CourseAccess`) |
| экран в конструкторе       | `web-screens` + `ui-kit`                                                                                                            |

## Остановись и спроси, если

- нужна история версий урока (сейчас только черновик/публикация, D-033);
- правка затрагивает уже опубликованные уроки с прогрессом учеников (пересчёт прогресса?).
