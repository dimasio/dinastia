---
name: i18n
description: Строки интерфейса и локализация Dinastia — i18next, файлы packages/i18n/locales/ru/<namespace>.json (namespace = модуль, плюс common, errors, blocks, questions, emails, settings), ключи вида <ns>:<раздел>.<ключ>, t() в компонентах и на сервере, плюрализация, интерполяция, даты/числа/деньги через форматтеры, коды ошибок errors:<CODE>, проверка отсутствующих ключей в pnpm check. Использовать при любой работе с текстом в UI, письмах, ошибках — «переведи», «подпись», «текст кнопки», «добавь язык».
---

# Строки и локализация

> Статус: сверено с кодом в фазе 0 (пункт 0.7); форматтеры денег/чисел и серверный `ctx.t` — по мере надобности (фаза 1+).

Язык по умолчанию — `ru`; i18n с первого дня (D-014). Литералы в JSX запрещены (lint).

## Файлы и ключи

```
packages/i18n/
  locales/ru/common.json   общие: save, cancel, roles.*, theme.*, notFound, error
  locales/ru/errors.json   коды ошибок API: { "ALREADY_MEMBER": "Этот человек уже в учебном центре." }
  locales/ru/auth.json     вход (и код второго фактора), «ваши учебные центры», приглашение
  locales/ru/ops.json      консоль оператора /ops (5.6)
  locales/ru/nav.json      меню областей
  locales/ru/home.json     главные экраны admin/learn
  src/index.ts             resources, createI18n, errorKey, formatDate
apps/web/src/app/i18n.ts   экземпляр + типизация ключей (CustomTypeOptions)
```

- Новый namespace: файл `locales/ru/<ns>.json` + импорт и строка в `resources` (`packages/i18n/src/index.ts`).
- Ключи типизированы: опечатка в `t('…')` — ошибка `pnpm typecheck`.
- Разделы внутри namespace: `nav`, `fields`, `actions`, `list`, `form`, `empty`, `confirm`, `toast`.

## Использование

```tsx
const { t } = useTranslation('auth')                   // свой namespace
t('signIn.schoolTitle', { school: school.name })       // интерполяция
t('roles.teacher', { ns: 'common' })                   // чужой namespace — через ns
t(errorText(error), { ns: 'errors' })                  // ошибка API: errorText → ключ errors (UNKNOWN, если кода нет)
t('lessonsCount', { count: n })                        // плюрализация: lessonsCount_one/_few/_many/_other
```

- Код ошибки сервера (`data.code`) → строка в `errors.json`; нет строки — пользователь увидит общий текст
  («Не удалось выполнить действие»), а `errorKey` подскажет, что строку надо добавить.
- Даты — `formatDate(date, school.timezone)` из `@dinastia/i18n`, не `toLocaleString` руками.
- Контент учебного центра (названия курсов, тексты тем) через i18n не переводится — это данные. Термины строк — глоссарий (D-067).

## Готово, когда

`pnpm check` зелёный: `i18n:check` не нашёл отсутствующих и неиспользуемых ключей, типы ключей пересобраны.

## Остановись и спроси, если

- нужен второй язык интерфейса (выбор языка, переводы) — согласуй с человеком;
- текст юридический (оферта, согласие на ПДн) — текст даёт человек.
