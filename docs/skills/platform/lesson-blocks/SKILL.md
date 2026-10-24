---
name: lesson-blocks
description: Реестр блоков урока Dinastia (packages/blocks) — новый тип блока через pnpm gen:block <type>: definition.ts с defineBlock (type, версия v, zod-схема данных, defaults, категория, иконка, completion none/view/interaction/grade, secretKeys и toPublic для скрытия ответов, responseSchema и evaluate для интерактивных, migrations между версиями), editor.tsx (редактор в конструкторе урока), viewer.tsx (просмотр в плеере ученика, состояние блока, onInteract), регистрация в registry.ts и registry.client.ts, проверка check:registries. Использовать для «новый блок урока», «блок видео/опрос/карточки/код», «поменять данные блока», «миграция данных блока».
---

# Блоки урока

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.3).

Урок хранит массив блоков в `draft_blocks`/`published_blocks` (D-019): `{ id, type, v, data }`. Тип блока — запись
реестра `packages/blocks`. Конструктор и плеер ничего не знают о конкретных блоках — только о контракте.

## Файлы блока

```
packages/blocks/src/<type>/
  definition.ts     изоморфно: схема, мета, toPublic, evaluate, миграции  (импортирует сервер)
  editor.tsx        редактор в конструкторе                                (только клиент)
  viewer.tsx        просмотр в плеере                                      (только клиент)
  <type>.test.ts    тест схемы, toPublic, evaluate, миграций
packages/i18n/locales/ru/blocks.json   → "<type>": { "title", "description", … }
```

`pnpm gen:block <type>` создаёт заготовки и регистрирует блок в `src/registry.ts` и `src/registry.client.ts`.
`type` — `snake_case`, после релиза не меняется (это данные).

## definition.ts

Контентный блок:

```ts
import { z } from 'zod'
import { defineBlock } from '../define'
import { RichText, emptyDoc } from '@dinastia/contracts/common'

export const callout = defineBlock({
  type: 'callout',
  v: 1,
  category: 'content',            // content | media | interactive | layout
  icon: 'Info',                   // имя иконки lucide
  schema: z.object({
    tone: z.enum(['info', 'warning', 'success']),
    text: RichText,
  }),
  defaults: () => ({ tone: 'info', text: emptyDoc() }),
  completion: 'none',
})
```

Интерактивный блок (ответ ученика проверяется сервером):

```ts
export const flashcards = defineBlock({
  type: 'flashcards',
  v: 2,
  category: 'interactive',
  icon: 'Layers',
  schema: z.object({
    cards: z.array(z.object({ id: z.string(), front: z.string(), back: z.string(), correct: z.boolean() })).min(1),
  }),
  defaults: () => ({ cards: [] }),
  completion: 'interaction',             // блок выполнен после первого валидного ответа
  secretKeys: ['cards.*.correct'],       // check:registries проверяет, что toPublic их убирает
  toPublic: (data) => ({ cards: data.cards.map(({ correct, ...c }) => c) }),
  responseSchema: z.object({ answers: z.record(z.string(), z.boolean()) }),
  evaluate: (data, response) => {        // чистая функция, выполняется на сервере
    const ok = data.cards.filter((c) => response.answers[c.id] === c.correct).length
    return { score: ok, max: data.cards.length, done: true }
  },
  migrations: {
    1: (old: { items: { front: string; back: string }[] }) =>
      ({ cards: old.items.map((i, n) => ({ id: String(n), ...i, correct: true })) }),
  },
})
```

| Поле | Смысл |
|---|---|
| `completion` | `none` — не влияет на завершение урока; `view` — выполнен при показе; `interaction` — после `evaluate` с `done`; `grade` — по оценке внешнего процесса (тест, ДЗ — блоки `quiz`/`assignment` модуля `assessments`) |
| `toPublic` | обязателен, если есть `secretKeys`; без секретов — по умолчанию identity |
| `evaluate` | только для `interactive`; результат пишется в `lesson_progress.blocks[<blockId>]` сервисом `learning` |
| `migrations[n]` | преобразует данные версии `n` в `n+1`; `v` = последняя версия |

## editor.tsx и viewer.tsx

```tsx
import type { BlockEditorProps, BlockViewerProps } from '../types'
import type { callout } from './definition'

export function Editor({ value, onChange, readOnly }: BlockEditorProps<typeof callout>) { … }
export function Viewer({ data, state, onInteract }: BlockViewerProps<typeof callout>) { … }
```

- Editor получает **полные** данные, вызывает `onChange(next)` — хост валидирует схемой и автосохраняет.
- Viewer получает **публичные** данные (`toPublic`) и `state` (сохранённый результат ученика);
  `onInteract(response)` отправляет ответ на сервер (`learn.block.interact`), возвращает результат `evaluate`.
- Компоненты — из `packages/ui`; строки — `t('blocks:<type>.…')`; тяжёлые зависимости — `lazy()`.
- Viewer адаптивен от 360px и доступен с клавиатуры.

## Изменить существующий блок

- Добавить необязательное поле с default — без новой версии (`schema` с `.default()`).
- Переименовать/изменить структуру — **новая версия**: `v: n+1`, миграция `migrations[n]`, тест на пример старых
  данных. Данные в БД мигрируются лениво при чтении (`parseBlock`) и при сохранении урока.

## Готово, когда

`pnpm check` зелёный (включая `check:registries`: уникальный `type`, `defaults()` проходит схему, `toPublic`
убирает `secretKeys`, миграции покрыты тестом, i18n-ключи есть); блок добавляется из палитры конструктора, виден в
плеере, интерактив засчитывается (e2e).

## Остановись и спроси, если

- блоку нужна серверная логика сложнее чистого `evaluate` (внешний сервис, хранение файлов, ручная проверка) —
  это блок модуля, как `quiz`/`assignment`; согласуй архитектуру;
- нужно удалить тип блока, который уже есть в уроках.
