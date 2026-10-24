---
name: lesson-blocks
description: Реестр блоков урока Dinastia (packages/blocks) — новый тип блока через pnpm gen:block <type> — таблица типа block_<type> в table.ts (blockTable, PK block_id → lesson_blocks, типизированные колонки, дочерние таблицы, миграция), definition.ts с defineBlock (type, zod-схема данных для API, defaults, категория, иконка, completion none/view/interaction/grade, secretKeys и toPublic, responseSchema/responseTable и evaluate для интерактивных, load/save/copy для сложных), editor.tsx в конструкторе, viewer.tsx в плеере, черновик/публикация строками с block_key, регистрация и check:registries. Использовать для «новый блок урока», «блок видео/опрос/карточки/код», «поле в блоке», «поменять данные блока».
---

# Блоки урока

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.3).

Модель — реляционная (D-032, D-033, D-034), `docs/specs/domain.md` §1 «Курсы и контент»:

```
lessons ─< lesson_blocks (id, lesson_id, block_key, state draft|published, type, position, is_required)
                 │ 1:1 по block_id
                 ├── block_text (body)          ← таблица типа
                 ├── block_video (source, provider, video_id, url, caption)
                 └── block_flashcards ─< block_flashcards_cards (…)   ← дочерняя таблица типа
```

Конструктор и плеер не знают о конкретных блоках — только о контракте `defineBlock`. Публикация, копирование,
загрузка урока делаются ядром по описанию таблиц типа.

## Файлы блока

```
packages/blocks/src/<type>/
  table.ts          Drizzle-таблицы типа            (импортирует только сервер: @dinastia/blocks/server)
  definition.ts     изоморфно: схема API, мета, toPublic, evaluate
  editor.tsx        редактор в конструкторе          (только клиент)
  viewer.tsx        просмотр в плеере                (только клиент)
  <type>.test.ts    тест: defaults, toPublic, evaluate, save/load/copy на БД
packages/i18n/locales/ru/blocks.json   → "<type>": { "title", "description", … }
```

`pnpm gen:block <type>` создаёт заготовки, регистрирует блок в `src/registry.ts`, `src/registry.client.ts`,
`src/tables.ts` (схемы для drizzle-kit) и генерирует миграцию. `type` — `snake_case`, после релиза не меняется.

## table.ts

```ts
import { boolean, pgEnum, text } from 'drizzle-orm/pg-core'
import { blockTable, richText } from '@dinastia/db' // хелперы схемы (ядро)

export const calloutTone = pgEnum('block_callout_tone', ['info', 'warning', 'success'])

export const blockCallout = blockTable('callout', {
	// → таблица block_callout: block_id PK/FK, school_id, RLS
	tone: calloutTone('tone').notNull().default('info'),
	body: richText('body').notNull(),
})
```

Дочерняя таблица (список внутри блока):

```ts
export const blockFlashcards = blockTable('flashcards', {
	shuffle: boolean('shuffle').notNull().default(false),
})
export const blockFlashcardsCards = blockChildTable('flashcards', 'cards', {
	// block_flashcards_cards: id, block_id FK cascade, school_id, position
	front: text('front').notNull(),
	back: text('back').notNull(),
	isCorrect: boolean('is_correct').notNull(),
})
```

Правила таблиц — скилл `db-schema` (типы, enum, FK на `files`/`questions`, индексы). JSON внутри блока — нельзя,
кроме тела форматированного текста `richText()`.

## definition.ts

Контентный блок:

```ts
import { z } from 'zod'
import { defineBlock } from '../define'
import { RichText, emptyDoc } from '@dinastia/contracts/common'

export const callout = defineBlock({
	type: 'callout',
	category: 'content', // content | media | interactive | layout
	icon: 'Info',
	schema: z.object({
		// форма данных в API = колонки таблицы типа
		tone: z.enum(['info', 'warning', 'success']),
		body: RichText,
	}),
	defaults: () => ({ tone: 'info', body: emptyDoc() }),
	completion: 'none',
})
```

Ядро сопоставляет `schema` с колонками `table.ts` (имена полей = свойства таблицы) и само делает `load`/`save`/`copy`
для однотабличного блока. `check:registries` проверяет, что поля схемы и колонки совпадают.

Интерактивный блок с дочерней таблицей и ответом ученика:

```ts
export const flashcards = defineBlock({
	type: 'flashcards',
	category: 'interactive',
	icon: 'Layers',
	schema: z.object({
		shuffle: z.boolean(),
		cards: z
			.array(
				z.object({ id: Id.optional(), front: z.string().max(500), back: z.string().max(500), isCorrect: z.boolean() }),
			)
			.min(1)
			.max(100),
	}),
	children: { cards: 'cards' }, // поле схемы → дочерняя таблица block_flashcards_cards (load/save/copy — ядро)
	defaults: () => ({ shuffle: false, cards: [] }),
	completion: 'interaction',
	secretKeys: ['cards.*.isCorrect'], // check:registries: toPublic их убирает
	toPublic: (d) => ({ shuffle: d.shuffle, cards: d.cards.map(({ isCorrect, ...c }) => c) }),
	responseSchema: z.object({ answers: z.array(z.object({ cardId: Id, value: z.boolean() })).max(100) }),
	responseTable: 'responses', // block_flashcards_responses (+ дочерняя _responses_answers) из table.ts
	evaluate: (d, r) => {
		// чистая функция, только на сервере
		const ok = d.cards.filter((c) => r.answers.find((a) => a.cardId === c.id)?.value === c.isCorrect).length
		return { score: ok, max: d.cards.length, done: true }
	},
})
```

| Поле                                          | Смысл                                                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`                                      | данные блока в API; совпадает с колонками таблицы типа (+ `children`)                                                                                       |
| `children`                                    | поле-массив → дочерняя таблица; порядок — `position`                                                                                                        |
| `completion`                                  | `none`; `view` — выполнен при показе; `interaction` — после `evaluate` с `done`; `grade` — по внешнему процессу (`quiz`, `assignment` модуля `assessments`) |
| `toPublic`                                    | обязателен при `secretKeys`; иначе — identity                                                                                                               |
| `responseSchema`, `responseTable`, `evaluate` | только `interactive`: ответ валидируется, сохраняется в таблицу ответов, результат — в `block_progress` (сервис `learning`)                                 |
| `load`, `save`, `copy`                        | (необязательно) свои функции для нестандартного хранения — например, `quiz` ссылается на `questions`                                                        |

## editor.tsx и viewer.tsx

```tsx
import type { BlockEditorProps, BlockViewerProps } from '../types'
import type { callout } from './definition'

export function Editor({ value, onChange, readOnly }: BlockEditorProps<typeof callout>) { … }
export function Viewer({ data, state, onInteract }: BlockViewerProps<typeof callout>) { … }
```

- Editor получает **полные** данные черновика, `onChange(next)` → хост валидирует схемой и автосохраняет
  (процедура `courses.blocks.update` → `save` ядра в строки `draft`).
- Viewer получает **публичные** данные (`toPublic` от `published`-строк) и `state` (`block_progress` + ответ);
  `onInteract(response)` → `learn.block.interact` → `evaluate` → результат.
- Компоненты — из `packages/ui`; строки — `t('blocks:<type>.…')`; тяжёлые зависимости — `lazy()`; viewer — от 360px,
  с клавиатуры.

## Черновик и публикация (ядро делает само)

- Правка — только строк `state = draft`. Публикация урока: удалить `published`-строки (каскад по таблицам типов),
  скопировать `draft` → `published` (через `copy` каждого типа) с тем же `block_key`.
- Ответы и прогресс ссылаются на `block_key` — новая публикация их не ломает.

## Изменить существующий блок

Данные блока — колонки, поэтому изменение = миграция БД (скилл `db-schema`):
- новое поле — колонка с default (или nullable) + поле в `schema` с `.default()`; миграция `pnpm db:generate`;
- переименование/изменение структуры — expand/contract: новая колонка → заполнение миграцией данных (и для `draft`,
  и для `published`) → переключение кода → удаление старой отдельной задачей.

## Готово, когда

`pnpm check` зелёный (`check:registries`: уникальный `type`, `defaults()` проходит схему, поля схемы = колонки,
`toPublic` убирает `secretKeys`, RLS у таблиц типа, i18n-ключи есть); тест `save → load → copy` на БД; блок
добавляется из палитры, виден в плеере после публикации, интерактив засчитывается (e2e).

## Остановись и спроси, если

- блоку нужна серверная логика сложнее чистого `evaluate` (внешний сервис, ручная проверка) — это блок модуля, как
  `quiz`/`assignment`; согласуй архитектуру;
- хочется хранить данные блока в JSON — нельзя (D-032), кроме `richText()`;
- нужно удалить тип блока, который уже есть в уроках.
