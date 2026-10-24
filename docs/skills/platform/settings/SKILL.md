---
name: settings
description: Настройки в Dinastia — настройки школы defineSettings в modules/<m>/settings.ts (ключ <модуль>.<имя>, zod-схема, default, кто видит и меняет, группа на экране настроек), чтение ctx.settings.get, экран /admin/settings строится из реестра, брендинг школы, фича-флаги школы; конфигурация окружения в apps/api/src/kernel/config.ts (переменные env, zod-валидация, .env.example), секреты. Использовать для «настройка школы», «включить/выключить для школы», «параметр», «переменная окружения», «фича-флаг».
---

# Настройки

> Статус: целевой — сверить с кодом в фазе 0 (конфиг) и 1 (настройки школы).

Два вида — не путать:

| Вид | Где | Кто меняет | Пример |
|---|---|---|---|
| **настройка школы** | `schools.settings` (JSONB), реестр `defineSettings` | владелец/админ школы в UI | режим доступа по умолчанию, цвет, срок доступа |
| **конфигурация окружения** | env → `kernel/config.ts` | девопс, при деплое | `DATABASE_URL`, ключи S3, SMTP |

## Настройки школы

```ts
// apps/api/src/modules/courses/settings.ts
import { z } from 'zod'
import { defineSettings } from '@/kernel/settings'

export const settings = defineSettings('courses', {
  defaultAccessMode: {
    schema: z.enum(['open', 'sequential', 'drip']),
    default: 'sequential',
    group: 'learning',                 // раздел экрана настроек
    edit: ['owner', 'admin'],
  },
  accessDays: {
    schema: z.number().int().min(0).nullable(),   // null — бессрочно
    default: null,
    group: 'learning',
    edit: ['owner', 'admin'],
  },
})
```

- Чтение: `await ctx.settings.get('courses.defaultAccessMode')` — типизировано, с default.
- Подписи и описания — `settings:<модуль>.<имя>.title|description` в i18n.
- Экран `/admin/settings` строится из реестра (группы, виджеты по zod — как в `admin-resource`).
- Изменилась схема настройки — версия реестра и миграция, как у блоков (скилл `lesson-blocks`).
- **Фича-флаг школы** — булева настройка с `edit: []` (меняет только оператор SaaS) — способ «временно
  включить/выключить» для школы вместо удаления кода.

## Конфигурация окружения

```ts
// apps/api/src/kernel/config.ts — ядро
export const config = z.object({
  DATABASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  // …
}).parse(process.env)
```

- Новая переменная — ядро: добавить в схему, в `.env.example` с безопасным примером, в `docs/guide/` деплоя.
- Секреты не коммитятся, не логируются, не попадают в клиент. Клиенту — только `VITE_*` без секретов.

## Готово, когда

Настройка видна на экране настроек нужным ролям, меняется, влияет на поведение (тест), default работает для
существующих школ без миграции. `pnpm check` зелёный.

## Остановись и спроси, если

- настройка нужна на уровне курса, а не школы (это поле `courses.settings` — скилл `db-schema`);
- нужна новая переменная окружения (ядро) или новый внешний сервис.
