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
- Куратор видит учеников **только своих потоков** — общая политика `learning/policies.ts → groupScope(ctx)`
  (по `enrollments`) и `enrollmentScope(ctx, колонка)` (по `enrollment_id` другой таблицы).
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
- Нет (фаза 4, дальше): дедлайны, drip-задача, сертификаты, аналитика.

## Зачисление (4.1)

- `enrollment.service.ts`: `enroll` (внутренняя; `already`/`enrolled`/`restored`), `enrollByEmail` (аккаунт создаёт только owner/admin через
  `auth.api.signUpEmail` со случайным паролем), `extend`/`unlimit`/`revoke`/`restore`, `listEnrollments`, `expireDueEnrollments` (задача
  `learning.expire-enrollments`, 03:10 по Москве). `learningScope(ctx)` = `groupScope` — куратор видит только свои потоки (4.2).
- API `learning.enrollments.*`; права `learning.read` (admin, teacher, curator), `learning.enroll` (admin, teacher).
- Экран — вкладка «Ученики» курса: `features/learning/learners.tsx`, ресурс `resources/enrollments.ts` (фабрика на курс), срок по умолчанию — `courses.update`.
- Приглашения (4.1(б)): `invites.service.ts` — `createLinkInvite`, `inviteByEmail` (задача `learning.send-course-invitation` выпускает токен), `getJoin`/`acceptJoin`;
  API `learning.invites.*` и публичные `join.*`; экран — панель «Ссылки-приглашения» (`invites-sheet.tsx`) и страница `/join/<токен>` (`join-page.tsx`).
  Токены — только хэш в БД; письма с токеном шлёт задача (`deliverEmail`), а не `ctx.mail.send`.
- Статус в списке считается с учётом срока (`shownStatus`): просроченный active/completed — «expired» ещё до задачи.

## Потоки (4.2)

- `groups.service.ts`: `listGroups` (куратор — свои), `createGroup`/`updateGroup` (кураторы — `setCurators`, только активные
  сотрудники), `removeGroup` (сначала обнуляет `group_id` у зачислений и приглашений — ключи `no action`), `curatorOptions`,
  `groupOfCourse` (поток этого курса или `GROUP_NOT_FOUND`), `groupExpiry` (срок потока от будущего старта или от зачисления).
- `enroll(…, { groupId })`, `moveEnrollment`, приглашения с `groupId`; API `learning.groups.*`, `learning.enrollments.move`;
  право `learning.groups.manage` (admin, teacher).
- Экран — вкладка «Потоки» (`features/learning/groups.tsx`, свои компоненты: множественный выбор кураторов), колонка «Поток» на
  «Учениках», поток в «Ссылках-приглашениях». Фильтр по потоку, выбор потока при зачислении и «Перевести в поток» в таблице —
  ждут запроса к ядру `docs/tasks/requests/resource-dynamic-options.md` (API готово: `filters.groupId`, `enroll.groupId`, `move`).
- Тесты: `groups.test.ts`; тестам проверки куратором нужен поток — `learning/testing.ts → intoCuratorGroup`, в e2e — команда
  `src/enroll.ts … [режим] curator@demo.local`.

## Завершение урока по результату (3.6)

- `learning/service.ts`: `recordBlockResult(ctx, { enrollmentId, lessonId, blockKey, done })` — публичный вызов для `assessments`
  (синхронно, в той же транзакции): пишет `block_progress` (`done` не снимается, `failed` его не понижает) и пересчитывает урок с
  правилом `all_blocks`; `openLesson` для `all_blocks` завершает урок, только если выполнены все блоки `completion: 'grade'`
  (`gradeBlocksDone`); `view` и `manual` — как раньше. Блоки «оценки» — по `blockDef(type).completion` опубликованной версии.
- Правило у новых уроков по умолчанию `all_blocks`; переключатель в конструкторе — `courses.lessons.update`.
- Отклонённая работа блок не выполняет — урок под `all_blocks` не завершится (сброс — фаза 4).
