---
name: lms-learners
description: Ученики и прогресс в Dinastia — модуль learning (зачисление вручную/по приглашению/по ссылке, сроки доступа, потоки-группы, кураторы групп, lesson_progress и progress_pct, пересчёт по событиям и drip по расписанию, дедлайны, кабинет ученика, аналитика курса, экспорт) и модуль certificates (шаблон, PDF, номер, проверка). Использовать для задач «зачисли», «поток», «куратор группы», «прогресс», «дедлайн», «доступ истёк», «аналитика», «сертификат».
---

# Ученики и прогресс

Правила — `docs/specs/domain.md` §3 «Зачисление», «Доступ к урокам», «Завершение урока», «Сертификат».

## Где лежит

| Что                                                                                               | Где                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| таблицы `groups`, `group_curators`, `enrollments`, `lesson_progress`, `deadlines`                 | `apps/api/src/modules/learning/schema.ts`             |
| зачисление, отзыв, истечение                                                                      | `apps/api/src/modules/learning/enrollment.service.ts` |
| доступ (`computeAccess` в `access.ts`, чистая) и прогресс (`recalcProgress` в `service.ts`)        | `apps/api/src/modules/learning/progress.service.ts`   |
| подписчики событий (`lesson.completed`, `quiz.graded`, `submission.reviewed`, `lesson.published`) | `apps/api/src/modules/learning/events.ts`             |
| задачи `learning.drip-unlock`, `learning.expire-enrollments`, `learning.deadline-reminders`       | `apps/api/src/modules/learning/jobs.ts`               |
| аналитика (запросы-агрегаты)                                                                      | `apps/api/src/modules/learning/analytics.service.ts`  |
| сертификаты                                                                                       | `apps/api/src/modules/certificates/`                  |
| экраны: ученики курса, потоки, кабинет ученика                                                    | `apps/web/src/features/learning/`                     |

## Ключевые правила для кода

- Зачисление идемпотентно: повторное по тому же `(member_id, course_id)` возвращает существующее активное.
- Прогресс **не** пишется из UI напрямую: UI шлёт факт (`learn.lesson.open`, `learn.block.interact`,
  `learn.lesson.complete`), сервис решает статус и эмитит события.
- `recalcProgress` — единственное место расчёта `progress_pct` и `enrollment.completed`;
  вызывается подписчиками, идемпотентно.
- Drip: задача раз в 15 минут открывает уроки, у которых наступил срок, по всем школам (`forEachSchool`).
- Публикация нового урока в курсе с пройденными учениками: `completed` у зачисления **не** снимается (правило MVP).
- Куратор видит учеников **только своих групп** — общая политика `learning/policies.ts → groupScope(ctx)`.
- Аналитика — SQL-агрегаты по индексам `(school_id, course_id)`; тяжёлые выгрузки — фоновой задачей (`documents`).
- Права: `learning.enroll` (owner, admin, teacher), `learning.groups.manage` (owner, admin, teacher),
  `learning.analytics` (+ curator в своих группах).

## Типовые задачи

| Задача                    | Как                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| новый способ зачисления   | `change-workflow`; процедура в контракте, `enrollment.service`, событие `enrollment.created` |
| новая метрика в аналитике | `analytics.service` + индекс (`db-schema`) + виджет (`web-screens`)                          |
| новое напоминание         | задача `background-jobs` + письмо `notifications`                                            |
| поле сертификата          | шаблон сертификата, `documents`                                                              |

## Остановись и спроси, если

- правило меняет прогресс уже зачисленных учеников (нужна миграция данных и решение человека);
- просят оплату за доступ — это релиз R2.

## Состояние (2.6, D-057)

- Есть: `enrollments`, `lesson_progress` (только `opened_at`/`completed_at`), `enrollMember` (внутренняя, идемпотентная),
  процедуры `learn.courses.list/get`, `learn.lessons.get/open/complete`, права `learning.study` (роль `student`), события
  `lesson.completed`, `enrollment.completed`, экраны `/learn`, `/learn/courses/$courseId`, плеер урока
  (`apps/web/src/features/learning/`). Доступность считается при чтении, `lesson_progress.status` не хранится.
- Зачислить для разработки и e2e: `pnpm --filter @dinastia/api exec tsx src/enroll.ts <школа> <email> "<курс>" [sequential]`.
- Нет (фаза 4): экраны и API зачисления, потоки, кураторы, дедлайны, drip-задача, сертификаты, аналитика.
