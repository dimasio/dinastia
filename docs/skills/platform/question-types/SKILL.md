---
name: question-types
description: Реестр типов вопросов теста Dinastia (packages/questions) — новый тип через pnpm gen:question <type> — definition.ts с defineQuestion (type, zod-схема вопроса поверх таблиц questions и question_items — какие kind элементов и колонки настроек использует тип, defaults, toPublic без правильных ответов, responseSchema ответа поверх quiz_answers/quiz_answer_items, grade → score/max/correct, manual для ручной проверки, review, shuffle), ревизии вопроса при правке использованного, editor.tsx в банке вопросов, viewer.tsx в попытке и разборе, check:registries. Использовать для «новый тип вопроса», «сопоставление/порядок/пропуски/числовой ответ», «частичные баллы», «поменять проверку ответа».
---

# Типы вопросов

> Статус: сверено с кодом в 1.4 (реестр, хранение и ревизии в ядре, хосты, генератор, тип `single_choice`).
> Банк вопросов курса (процедуры, теги) — 3.1; типы MVP — 3.2 (готово, семь типов); попытки, снимки, ответы (`quiz_answers`) — 3.3.

Модель — реляционная (D-032, D-035, D-052), `docs/specs/domain.md` §1 «Тесты и задания». **Все типы хранятся в общих
таблицах ядра** (`@dinastia/db`: `questions`, `question_items`); тип объявляет, какие колонки и виды элементов он
использует. `course_id` до пункта 2.1 без внешнего ключа (его добавит модуль `courses`).

```
questions (course_id, type, prompt, explanation, points, scoring, case_sensitive, number_answer, number_tolerance,
           revision_of, is_current, archived_at)
  └─< question_items (kind option|order_item|match_left|match_right|accepted_text, body|text, position, is_correct,
                      correct_position, match_key)
```

| Колонки и элементы | Кто использует |
| --- | --- |
| `prompt`, `explanation`, `points` | все типы (общие поля, обязательны в схеме) |
| `scoring`, `caseSensitive`, `numberAnswer`, `numberTolerance` | тип по `uses.columns`; у остальных ядро держит значения по умолчанию |
| вид элемента → поля: `option` → `body`, `isCorrect`; `order_item` → `body`, `correctPosition`; `match_left`/`match_right` → `body`, `matchKey`; `accepted_text` → `text` | тип по `uses.items` и `items` (поле-массив схемы → вид); у элемента в API ещё `id` |

Новый тип, которому хватает этих колонок и видов, — **без миграции**. Нужна новая колонка или вид — миграция
(`db-schema`) и согласование: колонка в `questions` с default или значение enum `question_item_kind`.

## Пакет `@dinastia/questions`

| Вход | Что | Кто импортирует |
| --- | --- | --- |
| `@dinastia/questions` | `defineQuestion`, `questionTypes`, `questionDef(type)`, `questionDefIssues`, типы пропсов | api и web |
| `@dinastia/questions/client` | `QuestionEditorHost`, `QuestionViewerHost`, `clientQuestions` (иконка, ленивые редактор/просмотр) | только web |

```
packages/questions/src/<type>/
  definition.ts   defineQuestion
  editor.tsx      редактор в банке вопросов (default export)
  viewer.tsx      просмотр в попытке и в разборе (default export)
packages/i18n/locales/ru/questions.json → "<type>": { "title", "description", … }; коды ошибок схемы — "errors"
```

`pnpm gen:question <type> [--title "Название"] [--dry-run]` — заготовка (ответ текстом по допустимым вариантам:
`uses: { columns: ['caseSensitive'], items: ['accepted_text'] }`, без миграции), регистрация у маркеров
`gen:question:*`, раздел `questions.json`. Вывод проходит `pnpm check` (CI проверяет пробным типом).

## definition.ts

```ts
import { CompactText, emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineQuestion } from '../define.ts'

export const singleChoice = defineQuestion({
	type: 'single_choice',
	uses: { columns: [], items: ['option'] }, // тип не трогает чужие колонки — ядро держит их по умолчанию
	schema: z.object({
		prompt: RichText,
		explanation: RichText.nullable(),
		points: z.number().int().min(1).max(100),
		options: z
			.array(z.object({ id: Id.optional(), body: CompactText, isCorrect: z.boolean() }))
			.min(2)
			.max(20)
			.refine((o) => o.filter((x) => x.isCorrect).length === 1, { message: 'NEED_ONE_CORRECT' }),
	}),
	items: { options: 'option' }, // поле схемы → question_items.kind
	defaults: () => ({ prompt: emptyDoc(), explanation: null, points: 1, options: [/* два пустых, первый верный */] }),
	example: () => ({ /* готовый вопрос: проходит схему, у вариантов — id */ }),
	secretKeys: ['options.*.isCorrect', 'explanation'],
	toPublic: ({ prompt, points, options }) => ({ prompt, points, options: options.map(({ isCorrect: _, ...o }) => o) }),
	responseSchema: z.object({ selected: Id.nullable() }),
	grade: (q, r) => {
		const correct = q.options.find((o) => o.isCorrect)?.id
		const isCorrect = r.selected !== null && r.selected === correct
		return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
	},
	review: (q) => ({ correct: q.options.filter((o) => o.isCorrect).map((o) => o.id), explanation: q.explanation }),
	shuffle: 'items',
})
```

| Поле | Смысл |
| --- | --- |
| `uses` | колонки `questions` (`uses.columns`) и виды элементов (`uses.items`) типа |
| `items` | поле-массив схемы → вид элемента; поля элемента — только колонки этого вида (+ `id`) |
| `defaults` | заготовка для редактора (может ещё не проходить схему) |
| `example` | готовый вопрос, проходит схему: по нему `defineQuestion` проверяет `toPublic`, по нему — тесты и генератор |
| `toPublic` | что видит ученик в попытке — **без** верных ответов и пояснения; убирает все `secretKeys` |
| `responseSchema` | ответ ученика (хранение — `quiz_answers`, 3.3) |
| `grade` | чистая детерминированная функция, только на сервере (`gradeAnswer` ядра); `score` ∈ [0, max] |
| `manual: true` | ручная проверка (`open_text`): `grade` не нужен, `gradeAnswer` вернёт `null` |
| `review` | разбор — отдаётся только по правилу `show_correct` блока `quiz` |
| `shuffle` | `'items'` — перемешивать элементы при снимке попытки; `false` — нет |

`defineQuestion` проверяет при объявлении: тип `snake_case`; `grade` есть или `manual`; общие поля на месте; каждое
поле схемы — общая колонка, колонка из `uses.columns` или поле `items`; поля элементов — колонки своего вида;
`example()` проходит схему; `toPublic(example)` не содержит ни одного `secretKeys`. Код ошибки в `refine`
(`NEED_ONE_CORRECT`) показывается в редакторе текстом `questions:errors.<код>`.

## Хранение и ревизии (ядро, `apps/api/src/kernel/questions/questions.ts`)

Функции — от `BaseCtx` (транзакция школы, RLS); вызывает их сервис модуля `assessments`.

| Функция | Что |
| --- | --- |
| `createQuestion(ctx, { courseId, type, data })` | вопрос в банке; данные — по схеме типа (`ZodError` → 400) |
| `getQuestion(s)(ctx, id/ids)` | вопросы любых ревизий с данными, пачкой (без N+1) |
| `listQuestions(ctx, courseId)` | банк курса: текущие ревизии без архивных |
| `updateQuestion(ctx, id, data)` | правка на месте — **пока на вопрос нет ответов**; элементы сохраняют свои `id` (чужие `id` не принимаются) |
| `reviseQuestion(ctx, id, data)` | правка вопроса **с ответами** (D-035): новая ревизия (`revision_of`), у прежней `is_current = false`, элементы — с новыми `id`; попытки остаются со своей ревизией |
| `archiveQuestion(ctx, id)` | убрать из банка (ревизии и попытки остаются) |
| `publicQuestion(q)`, `reviewQuestion(q)`, `gradeAnswer(q, response)` | данные ученику, разбор, проверка ответа |

Ошибки: `QUESTION_TYPE_UNKNOWN`, `QUESTION_NOT_FOUND`, `QUESTION_NOT_CURRENT` (правка прежней ревизии),
`QUESTION_ARCHIVED`. **Что вызывать — `updateQuestion` или `reviseQuestion` — решает сервис `assessments`** по
наличию ответов (`attempt_questions`, 3.3): ядро про попытки не знает (D-052).

## editor.tsx / viewer.tsx

```tsx
export default function SingleChoiceEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof singleChoice>) { … }
export default function SingleChoiceViewer({ data, response, onChange, review, testId }: QuestionViewerProps<typeof singleChoice>) { … }
```

- `QuestionEditorHost` — в банке: полные данные; правка → проверка схемой (коды `refine` — текстом) → `onChange` с
  задержкой (`delayMs`, 500).
- `QuestionViewerHost` — в попытке (`data` публичные, `onChange` есть) и в разборе (`review` передан, `onChange` нет):
  разбор подсвечивает верный вариант и выбранный неверный (не только цветом — значок с подписью).
- Иконка — в `registry.client.ts` (по умолчанию `DEFAULT_QUESTION_ICON`); строки — `t('questions:<type>.…')`;
  классы Tailwind из `packages/questions` сканируются (`@source` в `packages/ui/src/styles/globals.css`).
- Песочница `/dev/questions` (только dev) и e2e `tests/e2e/questions.spec.ts`: составить → пройти → проверить → разбор.

## Шаги

1. `pnpm gen:question <type>` (`snake_case`, неизменяем после релиза).
2. Хватает ли общих колонок и видов элементов? Нет — миграция и согласование (`db-schema`).
3. `uses`, `schema`, `items`, `example`, `toPublic`, `responseSchema`, `grade`, `review`; тесты на верный, неверный,
   частичный, пустой ответ и на `toPublic`.
4. Editor и Viewer, строки `packages/i18n/locales/ru/questions.json`.
5. `pnpm check`; e2e: составить вопрос, пройти, проверить.

## Изменение проверки существующего типа

Меняет баллы у **уже сданных** попыток? Пересчёт не делается автоматически — `change-workflow`, решение человека.

## Остановись и спроси, если

- проверка требует внешнего сервиса (запуск кода, AI-оценка) — не чистая функция;
- типу нужны данные, которые не укладываются в общие таблицы (новая колонка, новый `kind`);
- тип нужен вне тестов (опрос без правильного ответа — это блок, скилл `lesson-blocks`).

## Типы MVP (3.2)

| Тип | Колонки / элементы | Ответ ученика | Частичный балл |
| --- | --- | --- | --- |
| `single_choice` | `option` | `{ selected }` | нет |
| `multiple_choice` | `scoring`; `option` | `{ selected: id[] }` | да |
| `text_input` | `caseSensitive`; `accepted_text` (поле `accepted`) | `{ text }` | нет |
| `number` | `numberAnswer`, `numberTolerance` | `{ value }` | нет |
| `ordering` | `scoring`; `order_item` (поле `steps`, массив — в верном порядке, `correctPosition` = индекс) | `{ order: id[] }` | да |
| `matching` | `scoring`; `match_left`/`match_right` (поля `left`, `right`, пара — общий `matchKey`) | `{ pairs: [{left, right}] }` | да |
| `open_text` | — | `{ text }`, `manual: true` | — |

- Общее — `packages/questions/src/common.ts` (`PromptText`, `requiredCompact`, `Points`, `Scoring`, `shuffled`, `normalizeText`,
  `matchesPattern`, `roundScore`) и `shared.tsx` (`EditorFrame`, `ViewerFrame`): новый тип берёт их, а не копирует.
- Схема типа не допускает пустую формулировку и пустые элементы (коды `PROMPT_REQUIRED`, `OPTION_REQUIRED`, `ITEM_REQUIRED`);
  заготовка `defaults()` схему **не** проходит — редактор не сохраняет её, пока не заполнена.
- Порядок элементов в `toPublic` у `ordering` и `matching` не раскрывает ответ: `shuffled()` сортирует по хэшу id, а не по
  позиции; сервер в 3.3 перемешивает ещё и по попытке (`shuffle: 'items'`).
- Предпросмотр несохранённого вопроса выдаёт элементам временные id (`features/assessments/temp-ids.ts`).
