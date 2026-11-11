---
name: ops
description: Консоль оператора SaaS Dinastia (/ops на корневом домене, модуль modules/ops, спека ops.md) — оператор users.platform_role (pnpm ops:grant), обязательный второй фактор TOTP (better-auth twoFactor, вход только паролем + кодом), mw.operator и mw.operator2fa, создание школ (только здесь, приглашение владельца), список школ с метриками school_stats (задача ops.school-stats), карточка школы, поиск человека по почте, журнал консоли ops_audit, приостановка и возобновление школы, доступ поддержки и вход от имени участника (плагин kernel/auth/impersonation.ts, IMPERSONATION_FORBIDDEN), фича-флаги школ (defineSettings с edit пустым). Использовать для «консоль оператора», «ops», «создать школу», «приостановить школу», «войти от имени», «поддержка», «фича-флаг школы», «метрики школ».
---

# Консоль оператора SaaS

Спека — `docs/specs/ops.md` (сценарии, статусы, правила), решения — D-026, D-063, D-064. Консоль — сотрудникам Dinastia,
не школам: роли школы тут ни при чём.

## Где лежит

| Что | Где |
| --- | --- |
| процедуры `ops.*` | `packages/contracts/src/ops.ts`, `apps/api/src/modules/ops/router.ts` |
| чтение школ, людей, журнала; флаги | `apps/api/src/modules/ops/service.ts` |
| метрики `school_stats` и задача `ops.school-stats` | `apps/api/src/modules/ops/schema.ts`, `stats.ts` |
| приостановка, письмо `ops.school-suspension` | `apps/api/src/modules/ops/suspension.ts`, `emails/suspension.tsx` |
| журнал консоли `ops_audit` | `apps/api/src/kernel/ops/schema.ts`, `audit.ts` (`opsAuditWrite`) |
| вход от имени: проверки, запреты, журнал | `apps/api/src/kernel/ops/impersonation.ts`; плагин better-auth — `kernel/auth/impersonation.ts` |
| доступ поддержки школы | `apps/api/src/modules/schools/support-access.ts` (`schools.supportAccess.*`) |
| middleware | `kernel/orpc.ts`: `mw.operator` (корень + оператор, иначе 404), `mw.operator2fa`, ограничения сессии «от имени» |
| веб | `apps/web/src/routes/ops*.tsx`, `apps/web/src/features/ops/` (лэйаут, ресурсы, карточка, люди, 2FA), строки `ops.json` |
| CLI | `pnpm ops:grant <email> [--revoke]`; школа для разработки — `src/create-school.ts` |

## Новая процедура консоли

1. Контракт — в `opsContract` (`packages/contracts/src/ops.ts`), путь `/ops/...`.
2. Реализация — цепочка `mw.host → mw.session → mw.operator → mw.operator2fa` (без `operator2fa` — только `ops.me`; страж
   `findOperatorProceduresWithout2fa`).
3. Изменение — запись `opsAuditWrite` (без ПДн: id, а не почта); изменение в школе — ещё и `auditFor(tx, { memberId: null,
   operatorId })` в её журнал.
4. Данные школы — через `withTenant(schoolId, …)` (RLS), а не глобальным клиентом; глобальный клиент — только для глобальных таблиц
   (`schools`, `school_stats`, `ops_audit`, `users`), файл — в `ALLOWED` теста `global-db.test.ts`.
5. Тест в `modules/ops/ops.test.ts` (оператор со вторым фактором — `operator()` + `enable2fa()`), e2e — `tests/e2e/ops.spec.ts`.

## Правила

- Опасная для школы процедура (удаление, данные учеников, роли, настройки, доступ) — в `IMPERSONATION_FORBIDDEN`: иначе её
  выполнит поддержка под сессией «от имени».
- Фича-флаг школы — поле `defineSettings` с `edit: []`: экран настроек школы его не показывает, `settings.update` запрещает даже
  владельцу; меняет оператор в карточке школы (`ops.schools.setFlags`), строки — как у настроек.
- Публичной регистрации школ нет: новая школа — только `ops.schools.create` (или CLI для разработки).
- Метрики — числа и даты, без ПДн учеников.

## Готово, когда

`pnpm check` зелёный, тест прав (404 не оператору, `OPS_2FA_REQUIRED`) есть, действие видно в журнале консоли (и школы, если
касается школы), e2e `ops` зелёный.

## Остановись и спроси, если

- нужна роль оператора с ограниченными правами (поддержка/финансы) — в рамках не было;
- оператору нужно видеть данные учеников вне сессии «от имени» — это ПДн, решение владельца;
- новое действие консоли меняет деньги или удаляет данные школы.
