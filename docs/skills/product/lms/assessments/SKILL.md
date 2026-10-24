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
| очередь проверки, политика куратора                                                                                                                                                                                                             | `apps/api/src/modules/assessments/policies.ts` → `reviewScope(ctx)` |
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
- Куратор видит и проверяет **только сдачи учеников своих групп**: `reviewScope(ctx)` добавляет условие по
  `group_curators`; преподаватель/админ — все.
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
