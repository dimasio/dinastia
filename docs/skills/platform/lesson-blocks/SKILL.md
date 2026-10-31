---
name: lesson-blocks
description: Реестр блоков урока Dinastia (packages/blocks) — новый тип блока через pnpm gen:block <type> — таблица типа block_<type> в table.ts (blockTable, PK block_id → lesson_blocks, типизированные колонки, дочерние таблицы, миграция), definition.ts с defineBlock (type, zod-схема данных для API, defaults, категория, иконка, completion none/view/interaction/grade, secretKeys и toPublic, responseSchema/responseTable и evaluate для интерактивных, load/save/copy для сложных), editor.tsx в конструкторе, viewer.tsx в плеере, черновик/публикация строками с block_key, регистрация и check:registries. Использовать для «новый блок урока», «блок видео/опрос/карточки/код», «поле в блоке», «поменять данные блока».
---

# Блоки урока

> Статус: сверено с кодом в 1.3 (реестр, хранение и публикация в ядре, хосты, генератор, блок `callout`).
> Процедуры конструктора и плеера (`courses.blocks.*`, `learn.block.*`) — 2.3/2.6; хранение ответов
> (`responseTable`, `block_progress`) — с модулем `learning`; свои `load`/`save`/`copy` — с блоком `quiz` (3.x).

Модель — реляционная (D-032, D-033, D-034, D-051), `docs/specs/domain.md` §1 «Курсы и контент»:

```
lessons ─< lesson_blocks (id, lesson_id, block_key, state draft|published, type, position, is_required)
                 │ 1:1 по (school_id, block_id), on delete cascade
                 ├── block_callout (tone, body)                       ← таблица типа
                 └── block_flashcards ─< block_flashcards_cards (…)   ← дочерняя таблица типа (item_key, position)
```

`lesson_blocks` — таблица ядра (`@dinastia/db`): на неё ссылаются таблицы типов, публикацией управляет ядро. Внешний
ключ `lesson_id → lessons` добавит модуль `courses` (2.1). Конструктор и плеер не знают о конкретных блоках — только
о контракте `defineBlock`.

## Пакет `@dinastia/blocks`

| Вход | Что | Кто импортирует |
| --- | --- | --- |
| `@dinastia/blocks` | `defineBlock`, `blocks` (реестр определений), `blockDef(type)`, типы `BlockEditorProps`/`BlockViewerProps` | api и web |
| `@dinastia/blocks/server` | `blockStorages` (определение + таблицы), `blockStorage(type)`, `defineBlockStorage`, `blockStorageIssues` | только api |
| `@dinastia/blocks/tables` | только таблицы и enum (для `apps/api/src/db-schema.ts`) | только api |
| `@dinastia/blocks/client` | `BlockEditorHost`, `BlockViewerHost`, `BlockPalette`, `clientBlocks` (иконка, ленивые редактор/просмотр) | только web |

Веб не импортирует `table.ts` и `@dinastia/db` (в бандле нет Drizzle), api не импортирует `*.tsx`.

## Файлы блока

```
packages/blocks/src/<type>/
  table.ts          таблицы типа (blockTable, blockChildTable)
  definition.ts     defineBlock: схема API, defaults, completion, toPublic, evaluate
  editor.tsx        редактор в конструкторе (default export)
  viewer.tsx        просмотр в плеере (default export)
packages/i18n/locales/ru/blocks.json   → "<type>": { "title", "description", "fields": {…}, … }
```

`pnpm gen:block <type> [--title "Название"] [--category content|media|interactive|layout] [--dry-run]
[--no-migration]` создаёт заготовки (одно поле `text`), регистрирует тип у маркеров `gen:block:*` в
`registry.ts`, `server.ts`, `tables.ts`, `registry.client.ts`, добавляет раздел `blocks.json` и генерирует миграцию
`block_<type>`. Вывод сразу проходит `pnpm check` (CI проверяет пробным блоком). `type` — `snake_case`, после
релиза не меняется; ключ реестров = `type`.

## table.ts

```ts
import { blockTable, richText } from '@dinastia/db'
import { pgEnum } from 'drizzle-orm/pg-core'
import { CALLOUT_TONES } from './definition.ts'

export const calloutTone = pgEnum('block_callout_tone', CALLOUT_TONES)

// → block_callout: block_id PK + (school_id, block_id) → lesson_blocks on delete cascade, RLS
export const blockCallout = blockTable('callout', {
	tone: calloutTone('tone').notNull().default('info'),
	body: richText('body').notNull(),
})
```

Дочерняя таблица (список внутри блока):

```ts
export const blockFlashcards = blockTable('flashcards', { shuffle: boolean('shuffle').notNull().default(false) })
// → block_flashcards_cards: id, school_id, block_id (→ block_flashcards cascade), position, item_key + колонки
export const blockFlashcardsCards = blockChildTable(blockFlashcards, 'cards', {
	front: text('front').notNull(),
	isCorrect: boolean('is_correct').notNull(),
})
```

`item_key` — стабильный ключ элемента между черновиком и публикацией (как `block_key` у блока); в API — поле `key`
элемента. На него ссылаются ответы учеников («выбрана карточка X»), поэтому повторная публикация их не ломает.
Правила таблиц — скилл `db-schema`. JSON внутри блока нельзя, кроме тела форматированного текста `richText()`.

## definition.ts

Контентный блок (`packages/blocks/src/callout/definition.ts`):

```ts
import { CompactText, emptyDoc } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

export const CALLOUT_TONES = ['info', 'warning', 'success'] as const

export const callout = defineBlock({
	type: 'callout',
	category: 'content', // content | media | interactive | layout — раздел палитры
	schema: z.object({ tone: z.enum(CALLOUT_TONES), body: CompactText }), // поля = колонки table.ts
	defaults: () => ({ tone: 'info' as const, body: emptyDoc() }),
	completion: 'none',
})
```

Интерактивный блок с дочерней таблицей и секретом (как пробный тип в `apps/api/src/kernel/blocks/blocks.test.ts`):

```ts
export const flashcards = defineBlock({
	type: 'flashcards',
	category: 'interactive',
	schema: z.object({
		shuffle: z.boolean(),
		cards: z.array(z.object({ key: z.uuid().optional(), front: z.string().max(500), isCorrect: z.boolean() })).max(100),
	}),
	children: { cards: 'cards' }, // поле схемы → block_flashcards_cards
	defaults: () => ({ shuffle: false, cards: [] }),
	completion: 'interaction',
	secretKeys: ['cards.*.isCorrect'],
	toPublic: (d) => ({ shuffle: d.shuffle, cards: d.cards.map(({ isCorrect: _, ...c }) => c) }),
	responseSchema: z.object({ key: z.uuid() }),
	evaluate: (d, r) => {
		const ok = d.cards.find((c) => c.key === r.key)?.isCorrect === true
		return { score: ok ? 1 : 0, max: 1, done: true }
	},
})
```

`defineBlock` проверяет при объявлении: тип `snake_case`; `defaults()` проходит схему; при `secretKeys` есть
`toPublic` и он убирает каждый секрет; `children` ссылаются на поля схемы; `completion: 'interaction'` — с
`responseSchema` и `evaluate`. Регистрация хранения — `defineBlockStorage(def, table, children)` в `server.ts`:
сверяет поля схемы с колонками таблиц (`blockStorageIssues`) и падает на расхождении.

| Поле | Смысл |
| --- | --- |
| `schema` | данные блока в API; поля = колонки таблицы типа (+ `children`); проверяется при каждом сохранении |
| `children` | поле-массив → дочерняя таблица `block_<type>_<часть>`; порядок — индекс в массиве, ключ — `key` |
| `completion` | `none`; `view` — выполнен при показе; `interaction` — после `evaluate` с `done`; `grade` — внешний процесс модуля (`quiz`, `assignment`) |
| `toPublic` | данные ученику; обязателен при `secretKeys`, иначе — как есть |
| `responseSchema`, `evaluate` | интерактив: ответ и чистая проверка (сервер); хранение ответа и `block_progress` — модуль `learning` |

## Хранение и публикация (ядро, `apps/api/src/kernel/blocks/blocks.ts`)

Все функции — от `BaseCtx` (транзакция школы, RLS); вызывают их сервисы модуля `courses`, не роутеры напрямую.

| Функция | Что |
| --- | --- |
| `createBlock(ctx, { lessonId, type, position?, isRequired?, data? })` | строка `draft` + данные (`defaults()` типа), без позиции — в конец (шаг 1000) |
| `updateBlock(ctx, id, data)` | замена данных черновика по схеме типа (`ZodError` → 400); опубликованный — `BLOCK_NOT_DRAFT` |
| `removeBlock(ctx, id)` | удалить блок черновика; данные типа и элементы — каскадом |
| `reorderBlocks(ctx, lessonId, ids)` | новый порядок всех блоков черновика (`BLOCK_ORDER_MISMATCH`, если список неполный) |
| `listBlocks(ctx, lessonId, state?)` | блоки с данными по порядку; типы читаются пачкой (без N+1) |
| `publishBlocks(ctx, lessonId)` | одной транзакцией: удалить `published`-строки, скопировать `draft` с тем же `block_key` и `item_key` |
| `listPublicBlocks(ctx, lessonId)` | опубликованные блоки ученику — данные через `toPublic` |

Ошибки: `BLOCK_TYPE_UNKNOWN`, `BLOCK_NOT_FOUND`, `BLOCK_NOT_DRAFT`, `BLOCK_ORDER_MISMATCH`. Тест ядра с пробным типом
(своя таблица из теста, `registerProbeBlock`) — образец для проверки нового механизма хранения.

## editor.tsx и viewer.tsx

```tsx
import type { BlockEditorProps, BlockViewerProps } from '../types.ts'
import type { callout } from './definition.ts'

export default function CalloutEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof callout>) { … }
export default function CalloutViewer({ data, state, onInteract, testId }: BlockViewerProps<typeof callout>) { … }
```

- `BlockEditorHost` даёт редактору **полные** данные черновика; `onChange(next)` → хост проверяет схемой (ошибка —
  `blocks:host.invalid`) и через `delayMs` (500) отдаёт проверенные данные странице (автосохранение — 2.3).
- `BlockViewerHost` даёт просмотру **публичные** данные (`toPublic`) и `state`; `onInteract(response)` → сервер
  (`evaluate`) → новый `state`.
- Иконка палитры — в `registry.client.ts` (`lucide-react`, по умолчанию `DEFAULT_BLOCK_ICON`), не в определении:
  api не тянет иконки. Компоненты — из `@dinastia/ui`; строки — `t('blocks:<type>.…')`; редактор и просмотр
  грузятся лениво; просмотр — от 360px, с клавиатуры, в токенах темы (светлая и тёмная).
- Классы Tailwind из `packages/blocks` сканируются (`@source` в `packages/ui/src/styles/globals.css`).
- Песочница `/dev/blocks` (только dev) и e2e `tests/e2e/blocks.spec.ts` — палитра → черновик → публикация → просмотр.

## Изменить существующий блок

Данные блока — колонки, поэтому изменение = миграция БД (скилл `db-schema`):
- новое поле — колонка с default (или nullable) + поле в `schema` с `.default()`; миграция `pnpm db:generate`;
- переименование/изменение структуры — expand/contract: новая колонка → заполнение миграцией данных (и для `draft`,
  и для `published`) → переключение кода → удаление старой отдельной задачей.

## Готово, когда

`pnpm check` зелёный (тест `packages/blocks`: реестры согласованы — у типа есть хранение, клиентские компоненты,
строки `title`/`description`, ключ = `type`, поля схемы = колонки; с 1.5 — `check:registries`); тест ядра на
хранение для нестандартного типа; блок добавляется из палитры и виден в просмотре после публикации (e2e).

## Остановись и спроси, если

- блоку нужна серверная логика сложнее чистого `evaluate` (внешний сервис, ручная проверка) — это блок модуля, как
  `quiz`/`assignment`; согласуй архитектуру;
- хочется хранить данные блока в JSON — нельзя (D-032), кроме `richText()`;
- нужно удалить тип блока, который уже есть в уроках.
