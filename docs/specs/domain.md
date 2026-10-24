---
status: draft
---

# Предметная область (MVP)

Сущности, связи, статусы и правила MVP. Источник для продуктовых скиллов `lms*`. Колонки — целевые; фактические
— в `apps/api/src/modules/*/schema.ts` (при расхождении правится этот документ в той же задаче).

Общие колонки тенантной таблицы (`tenantColumns()`): `id uuid (v7)`, `school_id`, `created_at`, `updated_at`.

## 1. Модули и сущности

| Модуль | Таблица | Что |
|---|---|---|
| `schools` | `schools` | школа (тенант): `slug`, `name`, `settings jsonb`, `status` (`active`, `suspended`, `deleted`), `deletion_requested_at` |
| | `members` | пользователь в школе: `user_id`, `role`, `status` (`invited`, `active`, `blocked`) |
| `auth` (ядро) | `users`, `sessions`, `accounts`, `verifications`, `invitations` | better-auth |
| `courses` | `courses` | `title`, `slug`, `description`, `cover_file_id`, `status` (`draft`, `published`, `archived`), `settings jsonb` |
| | `sections` | раздел курса: `course_id`, `title`, `position` |
| | `lessons` | `section_id`, `course_id`, `title`, `position`, `draft_blocks jsonb`, `published_blocks jsonb`, `published_at`, `access jsonb`, `completion jsonb` |
| `assessments` | `questions` | банк вопросов курса: `course_id`, `type`, `v`, `data jsonb` (с правильным ответом), `tags text[]` |
| | `quiz_attempts` | попытка теста: `enrollment_id`, `lesson_id`, `block_id`, `status` (`in_progress`, `submitted`, `graded`), `score`, `max_score`, `started_at`, `submitted_at`, `questions jsonb` (снимок вариантов) |
| | `quiz_answers` | `attempt_id`, `question_id`, `response jsonb`, `score`, `is_correct` |
| | `submissions` | домашнее задание: `enrollment_id`, `lesson_id`, `block_id`, `status`, `content jsonb`, `grade`, `reviewer_member_id`, `submitted_at`, `reviewed_at` |
| | `submission_comments` | переписка по ДЗ: `submission_id`, `author_member_id`, `body jsonb`, `files` |
| `learning` | `groups` | поток/группа курса: `course_id`, `title`, `starts_at`, `ends_at`, `access_days` |
| | `group_curators` | `group_id`, `member_id` |
| | `enrollments` | ученик на курсе: `member_id`, `course_id`, `group_id?`, `status` (`active`, `completed`, `expired`, `revoked`), `enrolled_at`, `expires_at`, `completed_at`, `progress_pct` |
| | `lesson_progress` | `enrollment_id`, `lesson_id`, `status` (`locked`, `available`, `in_progress`, `completed`), `opened_at`, `completed_at`, `blocks jsonb` (состояние блоков) |
| | `deadlines` | `course_id`, `group_id?`, `lesson_id`, `due_at` или `due_days` от начала |
| `certificates` | `certificate_templates` | `course_id`, `title`, `layout jsonb` |
| | `certificates` | `enrollment_id`, `number`, `issued_at`, `file_id` |
| `files` (ядро) | `files` | `key` в S3, `mime`, `size`, `owner_member_id`, `status` (`pending`, `ready`) |
| `schools` | `school_domains` | прежние slug (редирект 90 дней), позже — свои домены |
| ядро | `audit_log` | `actor_member_id`, `action`, `entity`, `entity_id`, `diff jsonb`, `ip`, `created_at` — только добавление |
| ядро | `consents` | `user_id`, `school_id?`, `kind` (`offer`, `privacy`, `pd_processing`, `marketing`), `version`, `ip`, `created_at` |
| ядро | `webhook_events` | `provider`, `external_id` (уникален), `payload`, `status`, `processed_at` |
| ядро | `outbox` | доменные события до доставки подписчикам |

## 2. Роли

| Роль | Кто | Область | Коротко |
|---|---|---|---|
| `owner` | владелец школы | `admin` | всё, включая настройки, удаление школы, тариф |
| `admin` | администратор | `admin` | всё, кроме удаления школы и тарифа |
| `teacher` | автор/преподаватель | `admin` | курсы и контент, банк вопросов, проверка ДЗ всех групп |
| `curator` | куратор | `admin` | проверка ДЗ и прогресс **только своих групп** |
| `student` | ученик | `learn` | свои курсы, прохождение, свои попытки и ДЗ |

Одна роль на членство. Разрешения по ролям — в `permissions.ts` модулей (скилл `permissions`). Названия ролей и
термины школа не меняет (D-028).

**Оператор SaaS** — не роль школы, а глобальный признак `users.platform_role = 'operator'` (D-026): доступ к
области `/ops` (все школы), приостановка школ, вход от имени участника — только с записью в `audit_log` и баннером
«Вы вошли как …». Оператор не видит данные школы вне сессии «от имени».

## 3. Правила

### Курс и публикация
- Курс в `draft` не виден ученикам. `published` — виден зачисленным. `archived` — новые зачисления запрещены,
  у зачисленных доступ сохраняется до `expires_at`.
- Преподаватель правит `draft_blocks`; «Опубликовать урок» копирует `draft_blocks → published_blocks`,
  ставит `published_at`. Ученик видит только `published_blocks`, прошедшие `toPublic()`.
- Удалить блок, на который есть ответы учеников (тест, ДЗ), — только с подтверждением; попытки и ДЗ сохраняются.

### Доступ к урокам (`lessons.access`)
- `mode`: `open` (всегда) | `sequential` (после завершения предыдущего урока) | `drip` (через `days` после начала
  потока/зачисления или с `date`).
- Курс может задать режим по умолчанию в `courses.settings.access`.
- Статус `lesson_progress.status` вычисляется сервисом `learning` и пересчитывается по событиям
  `lesson.completed`, `enrollment.created`, по расписанию (drip).

### Завершение урока (`lessons.completion`)
- `rule`: `view` (открыл) | `all_blocks` (все обязательные блоки выполнены) | `manual` (кнопка «Завершить»).
- Блок задаёт свой вид завершения (`completion` в `defineBlock`): `none`, `view`, `interaction`, `grade`
  (тест пройден на ≥ `pass_score`, ДЗ принято).
- Прогресс курса `progress_pct` = завершённые уроки / опубликованные уроки.

### Тест (блок `quiz`)
- Данные блока: список `question_ids` или выборка `{ tags, count }` из банка, `attempts` (0 = без ограничений),
  `pass_score` (%), `time_limit_sec?`, `shuffle`, `show_correct` (`never`, `after_submit`, `after_pass`).
- Попытка фиксирует снимок вопросов; оценивание — на сервере через `grade()` типа вопроса; открытые вопросы
  (`open_text`) переводят попытку в `submitted` до ручной проверки.

### Домашнее задание (блок `assignment`)
- Статусы `submissions.status`: `draft → submitted → (needs_revision → submitted)* → accepted | rejected`.
- Проверяет: преподаватель — любые; куратор — только своих групп. После `accepted` блок считается выполненным.

### Зачисление
- Способы MVP: вручную сотрудником, по приглашению (email → magic link), по ссылке-приглашению курса.
- При зачислении создаётся `members` с ролью `student` (если нет), `enrollments`, `lesson_progress` для первого слоя.
- Срок доступа: `group.access_days` или `course.settings.access_days`; истечение — задача `learning.expire-enrollments`.

### Сертификат
- Выдаётся при `enrollment.completed`, если у курса есть шаблон; номер — `<slug школы>-<год>-<порядковый>`.

## 4. События (MVP)

| Событие | Когда | Данные |
|---|---|---|
| `course.published` | курс опубликован | `courseId` |
| `lesson.published` | урок опубликован | `lessonId`, `courseId` |
| `enrollment.created` | ученик зачислен | `enrollmentId`, `courseId`, `memberId` |
| `lesson.opened` / `lesson.completed` | ученик открыл / завершил урок | `enrollmentId`, `lessonId` |
| `quiz.submitted` / `quiz.graded` | попытка отправлена / оценена | `attemptId`, `passed` |
| `submission.submitted` / `submission.reviewed` | ДЗ отправлено / проверено | `submissionId`, `status` |
| `enrollment.completed` | курс пройден | `enrollmentId` |

Эти же события — триггеры автоматизаций после MVP.
