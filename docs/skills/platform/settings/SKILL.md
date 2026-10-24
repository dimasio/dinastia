---
name: settings
description: Настройки в Dinastia — настройки школы — таблица модуля <module>_settings (settingsTable, PK school_id, типизированные колонки с default, D-036) + defineSettings в modules/<m>/settings.ts (ключ <модуль>.<имя>, zod-схема, кто видит и меняет, группа на экране настроек), чтение ctx.settings.get, экран /admin/settings строится из реестра, брендинг школы, фича-флаги школы; конфигурация окружения в apps/api/src/kernel/config.ts (переменные env, zod-валидация, .env.example), секреты. Использовать для «настройка школы», «включить/выключить для школы», «параметр», «переменная окружения», «фича-флаг».
---

# Настройки

> Статус: целевой — сверить с кодом в фазе 0 (конфиг) и 1 (настройки школы).

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

```ts
// apps/api/src/kernel/config.ts — ядро
export const config = z
	.object({
		DATABASE_URL: z.string().url(),
		S3_ENDPOINT: z.string().url(),
		// …
	})
	.parse(process.env)
```

- Новая переменная — ядро: добавить в схему, в `.env.example` с безопасным примером, в `docs/guide/` деплоя.
- Секреты не коммитятся, не логируются, не попадают в клиент. Клиенту — только `VITE_*` без секретов.

## Готово, когда

Настройка видна на экране настроек нужным ролям, меняется, влияет на поведение (тест), default работает для
существующих школ без миграции. `pnpm check` зелёный.

## Остановись и спроси, если

- настройка нужна на уровне курса, а не школы (это поле `courses.settings` — скилл `db-schema`);
- нужна новая переменная окружения (ядро) или новый внешний сервис.
