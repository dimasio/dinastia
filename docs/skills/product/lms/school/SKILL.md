---
name: lms-school
description: Школа как тенант в Dinastia — модуль schools — создание школы оператором (5.6) и slug-поддомен, участники members и роли, приглашения сотрудников (invitations, magic link), смена роли и блокировка участника, владелец и передача владения, брендинг (логотип, цвет, название), настройки школы, жизненный цикл школы active/suspended/deleted, экспорт и удаление данных школы, переключение между школами у одного пользователя. Использовать для задач «пригласить сотрудника», «роли в школе», «поддомен», «брендинг», «заблокировать школу/участника», «удалить школу», «у пользователя несколько школ».
---

# Школа

Модель — `docs/specs/domain.md` §1 (`schools`, `members`), роли — §2. Auth и организации — better-auth (ядро,
скилл `core-kernel`); продуктовые правила — модуль `schools`.

## Где лежит

| Что                                                              | Где                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| таблица `schools` (корень тенанта) | `packages/db/src/schools.ts` |
| таблицы `members` (ядро — нужна каждому запросу) и `invitations` | `apps/api/src/kernel/members/schema.ts`, `apps/api/src/modules/schools/schema.ts`; пользователи, сессии, согласия — `apps/api/src/kernel/auth/schema.ts` (better-auth, D-007) |
| создание школы оператором (`createSchoolByOperator`: школа + приглашение владельца), школа с владельцем для сида/тестов/CLI (`createSchool`), список своих школ, членство | `apps/api/src/modules/schools/service.ts` (+ `listMySchools`, `findActiveMember`, `recordOwnerConsents`); консоль — `modules/ops` (скилл — спека `ops.md`) |
| приглашения сотрудников | `apps/api/src/modules/schools/invitations.service.ts` (`inviteStaff`, `getInvitation`, `acceptInvitation`) |
| сотрудники: список, смена роли, блокировка | `apps/api/src/modules/schools/members.service.ts` (`listStaff`, `changeStaffRole`, `setStaffStatus`) |
| API | `packages/contracts/src/schools.ts` (`schoolsContract`, `invitationsContract`, `membersContract`), `apps/api/src/modules/schools/router.ts` |
| схемы slug, ролей, приглашения | `packages/contracts/src/schools.ts` (`SchoolSlug`, `RESERVED_SLUGS`, `StaffInvite`) |
| настройки школы: реквизиты оператора ПДн (5.5); брендинг — 5.9 | `apps/api/src/modules/schools/settings.ts` (`schoolsSettings`, скилл `settings`), согласие — `legal.ts` (`schoolLegal`, `recordPdConsent`) |
| удаление школы (5.5) | ядро `apps/api/src/kernel/school-deletion/` (`requestSchoolDeletion`, `cancelSchoolDeletion`, `purgeDeletedSchools`, письмо `school-deletion.notice`) |
| резолв школы по хосту | ядро `apps/api/src/kernel/host.ts` (`resolveHost`) |
| экраны: сотрудники (ресурс `/admin/staff`), профиль (`/admin/profile`, `/learn/profile`, «Мои данные»), выбор школы (с «Отменить удаление»); настройки `/admin/settings` (+ «Удаление школы») | `apps/web/src/features/schools/` (`resources/staff.ts`, `profile-page.tsx`, `nav.ts`), `routes/admin/staff/`, `routes/*/profile.tsx`, `routes/register.tsx` |

## Правила

- **Slug** школы: `^[a-z0-9-]{3,32}$`, уникален, не из списка зарезервированных (`www`, `api`, `app`, `admin`,
  `mail`, `static`, `cdn`, `help`, `status`…); меняется только с подтверждением (ломает ссылки) — старый slug
  редиректит 90 дней (`school_domains`).
- **Владелец** ровно один. Передача владения — владелец выбирает admin, тот подтверждает; прежний становится admin.
  Владельца нельзя заблокировать или удалить.
- **Создание школы** (5.6) — только оператор в `/ops` (`ops.schools.create`): школа без участников + приглашение с ролью
  `owner` (`invited_by` пусто — приглашает Dinastia, срок 14 дней, письмо `schools.invitation` от «Dinastia»). Владелец входит
  по ссылке и принимает оферту и политику Dinastia (`recordOwnerConsents`), а не согласие школы. Публичной регистрации нет;
  для разработки и e2e — `src/create-school.ts`.
- **Приглашение** сотрудника: email + роль → задача `schools.send-invitation` выпускает токен (в БД — хэш) и шлёт
  письмо `schools.invitation` со ссылкой `/invite/<токен>` (срок 7 дней) → вход (пароль или magic link) → принять →
  `members.status = active`. Повторное приглашение того же email — обновляет срок и роль, не дублирует; новое письмо
  делает прежнюю ссылку недействительной. Откат запроса — ни приглашения, ни письма.
- Ученики приглашаются через зачисление (скилл `lms-learners`), не через этот поток.
- **Членство и RLS**: в транзакции школы видны только её участники; вне школы (`withUser`) — только свои
  членства (список школ). Политика «свои членства» намеренно не действует внутри школы — иначе членство в школе B
  дало бы роль в школе A (тест «членство в школе B не даёт доступа к школе A»).
- **Аватар** — у участника в каждой школе свой (`members.avatar_file_id`, файл школы `schools.avatar`, лимиты — `AVATAR`
  в контракте); ставит себе сам (`schools.updateMyAvatar`), прежний файл удаляется. Виден в меню и в списке сотрудников.
- **Смена роли** — owner/admin; admin не может назначить owner и не может понизить другого admin (только owner).
  Свою роль и свой доступ изменить нельзя (`CANNOT_CHANGE_SELF`), владельца — тоже (`OWNER_IMMUTABLE`); на экране
  «Сотрудники» такие строки без действий.
- **Блокировка участника** (`blocked`): сессии в этой школе отзываются, доступ к школе закрыт, данные сохраняются.
- **Один пользователь — много школ**: на корневом домене — список школ участника; внутри школы — только её данные.
  Сессия общая, членство проверяется по школе запроса.
- **Жизненный цикл**: `active` → `suspended` (5.6в: оператор в `/ops` с причиной — `schools.suspended_reason/at`; `schoolMw` пускает
  только владельца, остальным и гостю — `SCHOOL_SUSPENDED` с `schoolName` для страницы входа; владельцу — `me.suspension` → баннер;
  письма `ops.school-suspension`; журнал школы `schools.school.suspended/resumed` с `operatorId`; задачи школы пропускаются)
  → `deleted` (5.5): владелец в «Настройках» вводит адрес школы → `schools.requestDeletion`: школа **сразу закрыта** для всех
  (`schoolMw` → `SCHOOL_DELETING`), письма владельцам (сейчас и за 3 дня; задача `school-deletion.notice` с `inactiveSchool`),
  30 дней владелец отменяет в «Моих школах» корня (`schools.cancelDeletion`; `schools.mine` отдаёт удаляемые школы владельца с
  `deleteAt`); затем задача `school-deletion.purge` удаляет S3 `schools/<id>/`, строку `schools` (каскад) и пользователей без других
  школ, кроме владельца. Задачи школы со статусом не `active` пропускаются (кроме `inactiveSchool`).
- **Согласие на обработку ПДн школой** — при принятии приглашения сотрудника и присоединении ученика (`consent: true`,
  `recordPdConsent`); реквизиты — `schoolLegal` (скилл `personal-data`).
- Права: `schools.members.read` (owner, admin, teacher — только просмотр), `schools.members.manage` (owner, admin),
  `schools.settings.manage` (owner, admin), `schools.pd.manage` (owner, admin — данные учеников, 5.5), `schools.delete` (owner).

## События

`school.created`, `member.invited`, `member.joined`, `member.role_changed`, `member.blocked`, `school.suspended`,
`school.deletion_requested`.

## Остановись и спроси, если

- нужны свои домены школ (CNAME, TLS) — релиз R5;
- нужны роли или термины, настраиваемые школой — не делаем (D-028);
- задача про консоль оператора `/ops` (фаза 5, D-026) — пока не спроектирована: сначала `feature-design`.
