# Передача: 2026-11-08

Новая сессия начинает с: `AGENTS.md` → `task.md` → `plan.md` → этот файл. «династия» — продолжать отсюда.

## Где остановились

Фаза 4, пункт **4.1**. Часть (а) сделана и закоммичена (зачисление по почте, сроки, отзыв, вкладка «Ученики»). Дальше — **часть (б)**:
таблица `enrollment_invites` (`course_id`, `token` хэшем, `email?`, `expires_at`, `max_uses`, `uses`, `created_by_member_id`, `revoked_at`;
`enrollments.invite_id`), API `learning.invites.*` и публичные `join.get/accept`, страница `/join/<токен>` (вход по magic link, как
`/invite/<token>` у сотрудников), письмо `learning.course-invitation` (адресное — токен не в очереди, как у сотрудников), панель
«Ссылки-приглашения» на вкладке «Ученики»; для преподавателя незнакомая почта → адресное приглашение (вместо `ONLY_ADMIN_CREATES_ACCOUNTS`).
Решения владельца — в карточке `changes/4.1-enrollment.md` §4.

## Состояние кода

`main`, push не делался. Миграции до `0020_enrollment_revoked`. Аккаунт ученика владелец/админ создают через `auth.api.signUpEmail`
(случайный пароль, вход по magic link). Куратор до 4.2 видит всех учеников и все работы (`learningScope`, `reviewScope`).

## Не забыть

См. `docs/tasks/phase-1-registries/notes/handoff.md` «Не забыть» (Node 24, `env:check`, правки русских доков — скриптом через Write).
Плавающие e2e при полном прогоне (phase-3 «review-screen куратора») — не воспроизводятся поодиночке.
