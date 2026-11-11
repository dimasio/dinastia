---
name: settings
description: Настройки в Dinastia — настройки школы — таблица модуля <module>_settings (settingsTable, PK school_id, типизированные колонки с default, D-036) + defineSettings в modules/<m>/settings.ts (ключ <модуль>.<имя>, zod-схема, кто видит и меняет, группа на экране настроек), чтение ctx.settings.get, экран /admin/settings строится из реестра, брендинг школы, фича-флаги школы; конфигурация окружения в apps/api/src/kernel/config.ts (переменные env, zod-валидация, .env.example), секреты. Использовать для «настройка школы», «включить/выключить для школы», «параметр», «переменная окружения», «фича-флаг».
---

# Настройки

> Статус: сверено с кодом в 5.5 (`settingsTable`, `defineSettings`, `ctx.settings`, `updateSettings`, экран `/admin/settings`,
> процедуры `settings.list`/`settings.update`). Первая настройка — `schools_settings` (реквизиты оператора ПДн).

Три вида — не путать:

| Вид                        | Где                                                                     | Кто меняет                | Пример                                            |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| **настройка школы**        | таблица `<module>_settings` (строка на школу) + реестр `defineSettings` | владелец/админ школы в UI | приём учеников по ссылке, напоминания о дедлайнах |
| **поле сущности**          | колонка `courses`, `lessons`, `school_branding`…                        | по правам сущности        | режим доступа курса, срок доступа, цвет школы     |
| **конфигурация окружения** | env → `kernel/config.ts`                                                | девопс, при деплое        | `DATABASE_URL`, ключи S3, SMTP                    |

## Настройки школы

Настройка школы — колонка в таблице настроек модуля (строка на школу, создаётся при первом чтении с default
колонок; D-036):

```ts
// apps/api/src/modules/learning/schema.ts
import { settingsTable } from '@dinastia/db'
import { boolean, integer } from 'drizzle-orm/pg-core'

// → learning_settings: PK school_id (каскад со школой), updated_at, RLS; у каждой колонки — default
export const learningSettingsTable = settingsTable('learning_settings', {
	selfEnrollByLink: boolean('self_enroll_by_link').notNull().default(true),
	deadlineReminderHours: integer('deadline_reminder_hours').notNull().default(24),
})
```

```ts
// apps/api/src/modules/learning/settings.ts
import { z } from 'zod'
import { defineSettings } from '#/kernel/settings/settings.ts'
import { learningSettingsTable } from './schema.ts'

export const learningSettings = defineSettings('learning', learningSettingsTable, {
	selfEnrollByLink: { schema: z.boolean(), group: 'learning', edit: ['owner', 'admin'] },
	deadlineReminderHours: { schema: z.number().int().min(1).max(168), group: 'notifications', edit: ['owner', 'admin'] },
})
// modules/learning/index.ts: defineModule({ …, settings: learningSettings })
```

| Что | Как |
| --- | --- |
| чтение (сервис, задача, подписчик) | `await ctx.settings.get(learningSettings, 'selfEnrollByLink')` — тип значения из колонки, опечатка в имени — ошибка компиляции (D-053); `await ctx.settings.all(learningSettings)` — все |
| изменение | `updateSettings(ctx, learningSettings, { deadlineReminderHours: 48 })` из `#/kernel/settings/settings.ts`: только переданные поля, каждое — по `schema` (`ZodError` → 400) и `edit` (owner — всегда; иначе `SETTING_FORBIDDEN`), неизвестное — `SETTING_UNKNOWN`; изменение — в журнал `settings.<модуль>.changed` с `diff` |
| `defineSettings` проверяет | таблица — `<модуль>_settings` (дефисы модуля → `_`); поле = колонка, каждая колонка описана; у колонки есть default (у новой школы строки нет) |
| `check:registries` | то же + строки `settings:<модуль>.<имя>.title\|description` и `settings:groups.<группа>` (`packages/i18n/locales/ru/settings.json`) |
| новая настройка | колонка с default + поле в `defineSettings` + строки; миграция `pnpm db:generate` (скилл `db-schema`) — существующие школы получают default без заполнения данных |

- Экран `/admin/settings` (`apps/web/src/features/settings/settings-page.tsx`) строится из реестра: `settings.list`
  (`kernel/settings/router.ts`, право `schools.settings.manage`) отдаёт поля всех модулей с видом контрола из zod
  (`kernel/settings/view.ts`: `text`/`email`/`url`/`number`/`boolean`/`select`, `''` в схеме — «необязательно»), значением и
  `editable`; раздел = модуль + группа, сохраняется `settings.update({ module, patch })`. Пояснение раздела — строка
  `settings:groupHints.<группа>` (необязательна); варианты `select` — `settings:<модуль>.<имя>.options.<значение>`.
- Что относится к одной сущности (курс, урок, брендинг школы) — **колонка этой сущности**, а не настройка.
- **Фича-флаг школы** — булева колонка с `edit: []` (меняет только оператор SaaS в `/ops`) — способ «временно
  включить/выключить» для школы вместо удаления кода.
- Тест механизма — `apps/api/src/kernel/settings/settings.test.ts` (пробная таблица — `test/probes.ts`).

## Конфигурация окружения

`apps/api/src/kernel/config.ts` (ядро): zod-схема `Env` над `process.env`; локально значения берутся из корневого
`.env` (`process.loadEnvFile`), в CI и проде — из окружения. Сервер не стартует с неверной конфигурацией.

```ts
const Env = z.object({
	DATABASE_URL: z.url(),
	APP_DOMAIN: z.string().min(1),
	AUTH_SECRET: z.string().min(32),
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
	// …
})
export const config: Config = Env.parse(process.env)
```

Новая переменная (ядро):
1. поле в `Env` с типом и, если безопасно, `default`;
2. строка в `.env.example` с безопасным локальным значением и комментарием (берётся и в CI — `cp .env.example .env`);
3. в тестах, если нужно другое значение, — `test.env` в `apps/api/vitest.config.ts`;
4. прод — описание в `docs/guide/` деплоя (фаза 5).

- Секреты не коммитятся (`.env` в `.gitignore`), не логируются (маскирование — скилл `observability`), не попадают в
  клиент. Клиенту — только то, что Vite кладёт через `define`/`VITE_*` (сейчас `VITE_APP_DOMAIN`), без секретов.
- Хелпер `appOrigin(slug?)` — адрес корня или школы для писем и ссылок.

## Готово, когда

Настройка видна на экране настроек нужным ролям, меняется, влияет на поведение (тест), default работает для
существующих школ без миграции. `pnpm check` зелёный.

## Остановись и спроси, если

- настройка нужна на уровне курса, а не школы (это поле `courses.settings` — скилл `db-schema`);
- нужна новая переменная окружения (ядро) или новый внешний сервис.
