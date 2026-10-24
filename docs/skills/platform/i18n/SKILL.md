---
name: i18n
description: Строки интерфейса и локализация Dinastia — i18next, файлы packages/i18n/locales/ru/<namespace>.json (namespace = модуль, плюс common, errors, blocks, questions, emails, settings), ключи вида <ns>:<раздел>.<ключ>, t() в компонентах и на сервере, плюрализация, интерполяция, даты/числа/деньги через форматтеры, коды ошибок errors:<CODE>, проверка отсутствующих ключей в pnpm check. Использовать при любой работе с текстом в UI, письмах, ошибках — «переведи», «подпись», «текст кнопки», «добавь язык».
---

# Строки и локализация

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.7).

Язык по умолчанию — `ru`; i18n с первого дня (D-014). Литералы в JSX запрещены (lint).

## Файлы и ключи

```
packages/i18n/locales/ru/
  common.json        общие: save, cancel, delete, search, empty…
  errors.json        коды ошибок сервера: { "COURSE_ARCHIVED": "Курс в архиве" }
  courses.json       модуль: { "nav": {…}, "fields": { "title": "Название" }, "actions": {…}, "list": {…} }
  blocks.json        { "<type>": { "title": "…", "description": "…" } }
  questions.json, emails.json, settings.json, …
```

- Ключ: `<ns>:<раздел>.<ключ>`, разделы — `nav`, `fields`, `actions`, `list`, `form`, `empty`, `confirm`, `toast`.
- `fields.<поле>` — подпись поля и заголовок колонки (ресурс берёт их сам).
- Новый namespace регистрируется в `packages/i18n/src/index.ts` (генераторы делают это).

## Использование

```tsx
const { t } = useTranslation('courses')
t('list.title') // в своём namespace
t('common:save') // общий
t('courses:lessonsCount', { count: n }) // ключи lessonsCount_one / _few / _many / _other (русская плюрализация)
t('learning:dueAt', { date }) // в строке: "до {{date, datetime}}"
```

- Даты, числа, деньги — форматтеры `formatDate`, `formatNumber`, `formatMoney` из `@dinastia/i18n` (часовой пояс
  школы), не `toLocaleString` руками.
- Сервер (письма, документы): `ctx.t` с языком получателя.
- Ошибки: сервер отдаёт `data.code`, клиент — `t('errors:' + code)`; новый код ошибки → строка в `errors.json`.
- Контент школы (названия курсов, тексты уроков) **не** переводится через i18n — это данные.

## Готово, когда

`pnpm check` зелёный: `i18n:check` не нашёл отсутствующих и неиспользуемых ключей, типы ключей пересобраны.

## Остановись и спроси, если

- нужен второй язык интерфейса (выбор языка, переводы) — согласуй с человеком;
- текст юридический (оферта, согласие на ПДн) — текст даёт человек.
