---
name: lms-school
description: Школа как тенант в Dinastia — модуль schools — регистрация школы и slug-поддомен, участники members и роли, приглашения сотрудников (invitations, magic link), смена роли и блокировка участника, владелец и передача владения, брендинг (логотип, цвет, название), настройки школы, жизненный цикл школы active/suspended/deleted, экспорт и удаление данных школы, переключение между школами у одного пользователя. Использовать для задач «пригласить сотрудника», «роли в школе», «поддомен», «брендинг», «заблокировать школу/участника», «удалить школу», «у пользователя несколько школ».
---

# Школа

Модель — `docs/specs/domain.md` §1 (`schools`, `members`), роли — §2. Auth и организации — better-auth (ядро,
скилл `core-kernel`); продуктовые правила — модуль `schools`.

## Где лежит

| Что                                                              | Где                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| таблица `schools` (корень тенанта) | `packages/db/src/schools.ts` |
| таблицы `members` (ядро — нужна каждому запросу) и `invitations` | `apps/api/src/kernel/members/schema.ts`, `apps/api/src/modules/schools/schema.ts`; пользователи, сессии, согласия — `apps/api/src/kernel/auth/schema.ts` (better-auth, D-007) |
| регистрация школы, список своих школ, членство | `apps/api/src/modules/schools/service.ts` (`createSchool`, `listMySchools`, `findActiveMember`) |
| приглашения сотрудников | `apps/api/src/modules/schools/invitations.service.ts` (`inviteStaff`, `getInvitation`, `acceptInvitation`) |
| API | `packages/contracts/src/schools.ts` (`schoolsContract`, `invitationsContract`), `apps/api/src/modules/schools/router.ts` |
| схемы slug, ролей, приглашения | `packages/contracts/src/schools.ts` (`SchoolSlug`, `RESERVED_SLUGS`, `StaffInvite`) |
| брендинг и общие настройки                                       | `apps/api/src/modules/schools/settings.ts` (скилл `settings`)        |
| резолв школы по хосту | ядро `apps/api/src/kernel/host.ts` (`resolveHost`) |
| экраны: сотрудники (ресурс), настройки, выбор школы, регистрация | `apps/web/src/features/schools/`, `routes/_auth/register-school.tsx` |

## Правила

- **Slug** школы: `^[a-z0-9-]{3,32}$`, уникален, не из списка зарезервированных (`www`, `api`, `app`, `admin`,
  `mail`, `static`, `cdn`, `help`, `status`…); меняется только с подтверждением (ломает ссылки) — старый slug
  редиректит 90 дней (`school_domains`).
- **Владелец** ровно один. Передача владения — владелец выбирает admin, тот подтверждает; прежний становится admin.
  Владельца нельзя заблокировать или удалить.
- **Приглашение** сотрудника: email + роль → письмо с magic link (срок 7 дней) → при входе создаётся/привязывается
  `users` и `members.status = active`. Повторное приглашение того же email — обновляет срок, не дублирует.
- Ученики приглашаются через зачисление (скилл `lms-learners`), не через этот поток.
- **Членство и RLS**: в транзакции школы видны только её участники; вне школы (`withUser`) — только свои
  членства (список школ). Политика «свои членства» намеренно не действует внутри школы — иначе членство в школе B
  дало бы роль в школе A (тест «членство в школе B не даёт доступа к школе A»).
- **Смена роли** — owner/admin; admin не может назначить owner и не может понизить другого admin (только owner).
- **Блокировка участника** (`blocked`): сессии в этой школе отзываются, доступ к школе закрыт, данные сохраняются.
- **Один пользователь — много школ**: на корневом домене — список школ участника; внутри школы — только её данные.
  Сессия общая, членство проверяется по школе запроса.
- **Жизненный цикл**: `active` → `suspended` (оператор SaaS в `/ops`: неоплата, нарушение — вход только владельцу с баннером)
  → `deleted` (по запросу владельца: 30 дней на отмену, затем задача удаляет данные школы и файлы; скилл
  `personal-data`).
- Права: `schools.members.read` (owner, admin, teacher — только просмотр), `schools.members.manage` (owner, admin),
  `schools.settings.manage` (owner, admin), `schools.delete` (owner).

## События

`school.created`, `member.invited`, `member.joined`, `member.role_changed`, `member.blocked`, `school.suspended`,
`school.deletion_requested`.

## Остановись и спроси, если

- нужны свои домены школ (CNAME, TLS) — релиз R5;
- нужны роли или термины, настраиваемые школой — не делаем (D-028);
- задача про консоль оператора `/ops` (фаза 5, D-026) — пока не спроектирована: сначала `feature-design`.
