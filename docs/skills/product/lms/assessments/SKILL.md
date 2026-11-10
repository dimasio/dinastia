---
name: lms-assessments
description: Тесты и домашние задания в Dinastia — модуль assessments — банк вопросов курса с тегами, блок quiz (попытки, проходной балл, таймер, перемешивание, показ ответов), снимок вопросов в попытке, серверная проверка, ручная проверка open_text; блок assignment и сдачи submissions со статусами draft/submitted/needs_revision/accepted/rejected, очередь проверки для преподавателя и куратора, переписка. Использовать для задач про тесты, вопросы, баллы, попытки, ДЗ, проверку, «куратор проверяет».
---

# Тесты и задания

Правила — `docs/specs/domain.md` §3 «Тест», «Домашнее задание». Типы вопросов — скилл `question-types`.

## Где лежит

| Что                                                                                                                                                                                                                                             | Где                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| таблицы банка (`questions`, `question_items`, `question_tags`…), попыток (`quiz_attempts`, `attempt_questions`, `attempt_question_items`, `quiz_answers`, `quiz_answer_items`), сдач (`submissions`, `submission_files`, `submission_comments`) | `apps/api/src/modules/assessments/schema.ts`                        |
| таблицы блоков `block_quiz`, `block_quiz_questions`, `block_quiz_tags`, `block_assignment`                                                                                                                                                      | `packages/blocks/src/{quiz,assignment}/table.ts`                    |
| старт/сдача попытки, оценивание                                                                                                                                                                                                                 | `apps/api/src/modules/assessments/quiz.service.ts`                  |
| сдача и проверка ДЗ                                                                                                                                                                                                                             | `apps/api/src/modules/assessments/submission.service.ts`            |
| очередь проверки, политика куратора                                                                                                                                                                                                             | `review.service.ts` → `reviewScope(ctx)` / `reviewScopeOf(ctx, колонка)` (правило — `learning/policies.ts`) |
| блоки `quiz`, `assignment`                                                                                                                                                                                                                      | `packages/blocks/src/quiz/`, `packages/blocks/src/assignment/`      |
| типы вопросов                                                                                                                                                                                                                                   | `packages/questions/src/<type>/`                                    |
| банк вопросов (ресурс), очередь проверки, экран проверки                                                                                                                                                                                        | `apps/web/src/features/assessments/`                                |

## Ключевые правила для кода

- **Правильные ответы — только на сервере** (D-020). Ученику вопросы — через `toPublic()` типа вопроса;
  `show_correct` раскрывает разбор только в ответе `quiz.submit`/`quiz.result` и только по правилу блока.
- Старт попытки: проверить `attempts_limit` под блокировкой, сделать **снимок** — строки `attempt_questions`
  (конкретные ревизии вопросов) и `attempt_question_items` (порядок вариантов). Правка использованного вопроса
  создаёт новую ревизию (D-035), попытка не меняется.
- Таймер — серверный: `deadline_at = started_at + time_limit_sec`; ответ после срока — 409 `ATTEMPT_EXPIRED`, попытка
  автосдаётся задачей `assessments.expire-attempts`.
- Оценивание: `grade()` каждого вопроса по `quiz_answers`/`quiz_answer_items` → сумма → `passed = score/max ≥ pass_score_pct`. Есть `open_text` → статус
  `submitted`, итог после ручной проверки. События `quiz.submitted`, `quiz.graded`.
- ДЗ: переходы статусов только через `submission.service` (функция `transition(from, to, actor)` с таблицей
  разрешённых переходов); каждый переход — событие и письмо ученику.
- Куратор видит и проверяет **только сдачи и попытки учеников своих потоков** (4.2): `reviewScope(ctx)` — условие на `enrollments`
  (очередь), `reviewScopeOf(ctx, <таблица>.enrollmentId)` — для выборок без соединения (карточка, оценка); `reviewSubmission` тоже
  проверяет область. Преподаватель и админ — все.
- Права: `assessments.bank.manage` (owner, admin, teacher), `assessments.review` (+ curator), ученик — собственные
  попытки и сдачи через процедуры `learn.*`.

## Типовые задачи

| Задача                    | Как                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| новый тип вопроса         | скилл `question-types`                                                                              |
| новая настройка теста     | колонка `block_quiz` + поле схемы блока + миграция (скилл `lesson-blocks`), логика в `quiz.service` |
| новый статус ДЗ           | `change-workflow`: таблица переходов, enum, письма, UI очереди                                      |
| фильтр в очереди проверки | `admin-resource` (фильтр ресурса) + `reviewScope`                                                   |

## Остановись и спроси, если

- меняется формула балла или проходной логики у уже пройденных попыток (пересчитывать ли);
- нужна взаимопроверка учениками, прокторинг, антиплагиат — вне MVP.

## Состояние (3.1)

- Есть: банк вопросов курса и теги — `apps/api/src/modules/assessments/` (`schema.ts` — `question_tags` с колонкой `label`,
  `question_tag_links`; `question.service.ts` — список с поиском и фильтрами, теги, архив; `hasAnswers` пока всегда `false`),
  права `assessments.bank.read/manage`, контракт `packages/contracts/src/assessments.ts` (`assessments.questions.*`,
  `assessments.tags.*`), экраны `apps/web/src/features/assessments/` (банк на ресурсе-фабрике `questionsResource(курс, теги)`,
  экран вопроса, ввод тегов, диалог «Теги курса»), маршруты `/admin/courses/$courseId/questions[/$questionId]`.
- Ядро вопросов (`kernel/questions`) не менялось; редактор типа берётся из реестра (`clientQuestion`).
- Нет (3.2+): остальные типы вопросов, блок `quiz`, попытки, задания, очередь проверки.

## Состояние (3.3)

- Есть: блок `quiz` (`packages/blocks/src/quiz/`: настройки, фиксированный список или случайные по тегам, `issues`), редактор в
  конструкторе урока `apps/web/src/features/assessments/quiz-block-editor.tsx` (редакторам блоков API недоступен — конструктор
  подставляет этот экран по типу блока; запасной `editor.tsx` блока — только заглушка), таблицы попыток (`quiz_attempts`,
  `attempt_questions`, `attempt_question_items`, `quiz_answers`, `quiz_answer_items` в `modules/assessments/schema.ts`),
  `quiz.service.ts` (`getQuizState`, `startAttempt`, `saveAnswer`, `finalizeAttempt`, `submitAttempt`, `resultOf`),
  `answers.ts` (ответ ↔ строки по ключам `selected`/`order`/`pairs`/`text`/`value`), задача `assessments.expire-attempts`,
  события `quiz.submitted`/`quiz.graded`, API `quiz.*` (право `assessments.attempt`), панель теста в плеере
  `apps/web/src/features/learning/quiz/quiz-panel.tsx` (плеер подставляет её вместо `BlockViewerHost` для блоков `quiz`).
- Правка вопроса с попытками — ревизия (`hasAnswers` по `attempt_questions`); `resolveCurrent` подменяет id вопроса текущей ревизией.
- Нет (3.4–3.6): блок `assignment`, очередь проверки, ручная проверка `open_text`, завершение урока по результату теста.

## Состояние (3.4–3.5)

- Есть: блок `assignment` (`packages/blocks/src/assignment/`: формулировка, что принимать, число файлов, нужна ли проверка;
  редактор — обычный, в `packages/blocks`), таблицы `submissions`, `submission_files`, `submission_comments`
  (`modules/assessments/schema.ts`), `transitions.ts` (`transition`, `canTransition`, `isEditable` — единственное место
  переходов статусов), `submission.service.ts` (`getAssignment`, `saveDraft`, `submitAssignment`, `reviewSubmission`), назначение
  файла `assessments.submission-file` (`files.ts`), события `submission.submitted`/`submission.reviewed`, API `assignment.*`
  (права `assessments.submit` — ученик, `assessments.review` — admin/teacher), панель задания в плеере
  `apps/web/src/features/learning/assignment/assignment-panel.tsx` (подставляется вместо просмотра блока, как панель теста).
- 3.5: очередь `/admin/review` (ресурс `reviewResource`, подписи курсов в фильтре кладутся в i18n на лету) и экран проверки
  `/admin/review/$submissionId` (`features/assessments/review/`), переписка (`features/assessments/comments.tsx` — общая лента и
  поле комментария для экрана проверки и панели ученика), API `review.list/get/comment`, `assignment.reply`, `assignment.review` с
  `fileIds`, `review.service.ts` (`reviewScope`, `listQueue`, `getForReview`, `commentAsReviewer`), `submission_comment_files`,
  файлы `assessments.comment-file`, письмо `emails/submission-reviewed.tsx` и подписчик `subscribers.ts`, право `assessments.review`
  у куратора. С 4.2 область куратора — его потоки (правило — `learning/policies.ts`).
- 3.6: результат блока → завершение урока (`learning.recordBlockResult` вызывается из `finalizeAttempt`, `grading.service.gradeAttempt`,
  `submitAssignment` (автопринятие), `reviewSubmission`); ручная проверка `open_text`: `grading.service.ts` (`getAttemptForReview`,
  `gradeAttempt`), очередь `listQueue` объединяет задания и попытки с ручными вопросами (`kind`), экран
  `features/assessments/review/attempt-review.tsx`, API `review.attempt`/`review.gradeAttempt`, колонки `quiz_answers.graded_by_member_id`,
  `feedback`; `quiz.result` отдаёт `manual` (ручные вопросы с баллами и комментарием) всегда.
