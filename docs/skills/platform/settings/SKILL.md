---
name: settings
description: Настройки в Dinastia — настройки школы — таблица модуля <module>_settings (settingsTable, PK school_id, типизированные колонки с default, D-036) + defineSettings в modules/<m>/settings.ts (ключ <модуль>.<имя>, zod-схема, кто видит и меняет, группа на экране настроек), чтение ctx.settings.get, экран /admin/settings строится из реестра, брендинг школы, фича-флаги школы; конфигурация окружения в apps/api/src/kernel/config.ts (переменные env, zod-валидация, .env.example), секреты. Использовать для «настройка школы», «включить/выключить для школы», «параметр», «переменная окружения», «фича-флаг».
---

# Настройки

> Статус: конфигурация окружения — сверено с кодом в фазе 0; хелпер `settingsTable` — в 1.3; `defineSettings`,
> `ctx.settings` — пункт 1.14 (экран — с первой настройкой).

Три вида — не путать:

| Вид                        | Где                                                                     | Кто меняет                | Пример                                            |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| **настройка школы**        | таблица `<module>_settings` (строка на школу) + реестр `defineSettings` | владелец/админ школы в UI | приём учеников по ссылке, напоминания о дедлайнах |
| **поле сущности**          | колонка `courses`, `lessons`, `school_branding`…                        | по правам сущности        | режим доступа курса, срок доступа, цвет школы     |
| **конфигурация окружения** | env → `kernel/config.ts`                                                | девопс, при деплое        | `DATABASE_URL`, ключи S3, SMTP                    |

## Настройки школы

Настройка школы — колонка в таблице настроек модуля (строка на школу, создаётся лениво с default-значениями):

```ts
// apps/api/src/modules/learning/schema.ts
import { boolean, integer } from 'drizzle-orm/pg-core'
import { settingsTable } from '@dinastia/db'

export const learningSettings = settingsTable('learning_settings', {
	// PK school_id, RLS
	selfEnrollByLink: boolean('self_enroll_by_link').notNull().default(true),
	deadlineReminderHours: integer('deadline_reminder_hours').notNull().default(24),
})
```

```ts
// apps/api/src/modules/learning/settings.ts
import { z } from 'zod'
import { defineSettings } from '#/kernel/settings'
import { learningSettings } from './schema'

export const settings = defineSettings('learning', learningSettings, {
	selfEnrollByLink: { schema: z.boolean(), group: 'learning', edit: ['owner', 'admin'] },
	deadlineReminderHours: { schema: z.number().int().min(1).max(168), group: 'notifications', edit: ['owner', 'admin'] },
})
```

- Чтение: `await ctx.settings.get('learning.selfEnrollByLink')` — типизировано, default из колонки.
- Каждое поле `defineSettings` = колонка таблицы (`check:registries` сверяет); новая настройка = колонка с default +
  миграция (скилл `db-schema`) — существующие школы получают default без заполнения данных.
- Подписи и описания — `settings:<модуль>.<имя>.title|description` в i18n.
- Экран `/admin/settings` строится из реестра (группы, виджеты по zod — как в `admin-resource`).
- Что относится к одной сущности (курс, урок, брендинг школы) — **колонка этой сущности**, а не настройка.
- **Фича-флаг школы** — булева колонка с `edit: []` (меняет только оператор SaaS в `/ops`) — способ «временно
  включить/выключить» для школы вместо удаления кода.

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
