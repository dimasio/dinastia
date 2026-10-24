---
name: question-types
description: Реестр типов вопросов теста Dinastia (packages/questions) — новый тип через pnpm gen:question <type> — definition.ts с defineQuestion (type, zod-схема вопроса поверх таблиц questions и question_items — какие kind элементов и колонки настроек использует тип, defaults, toPublic без правильных ответов, responseSchema ответа поверх quiz_answers/quiz_answer_items, grade → score/max/correct, manual для ручной проверки, review, shuffle), ревизии вопроса при правке использованного, editor.tsx в банке вопросов, viewer.tsx в попытке и разборе, check:registries. Использовать для «новый тип вопроса», «сопоставление/порядок/пропуски/числовой ответ», «частичные баллы», «поменять проверку ответа».
---

# Типы вопросов

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.4).

Модель — реляционная (D-032, D-035), `docs/specs/domain.md` §1 «Тесты и задания». **Все типы MVP хранятся в общих
таблицах**; тип определяет, какие колонки и какие виды элементов он использует:

```
questions (type, prompt, explanation, points, scoring, case_sensitive, number_answer, number_tolerance, revision_of, is_current)
  └─< question_items (kind option|order_item|match_left|match_right|accepted_text, body|text, position, is_correct, correct_position, match_key)
ответ: quiz_answers (text_value, number_value, score, is_correct) ─< quiz_answer_items (item_id, position, matched_item_id)
```

| Тип               | Элементы                                                     | Ответ ученика                         |
| ----------------- | ------------------------------------------------------------ | ------------------------------------- |
| `single_choice`   | `option` (+ `is_correct`, ровно один)                        | один `quiz_answer_items.item_id`      |
| `multiple_choice` | `option` (+ `is_correct`, ≥1)                                | несколько `item_id`                   |
| `text_input`      | `accepted_text` (варианты верного), колонка `case_sensitive` | `text_value`                          |
| `number`          | — ; колонки `number_answer`, `number_tolerance`              | `number_value`                        |
| `ordering`        | `order_item` (+ `correct_position`)                          | `item_id` + `position`                |
| `matching`        | `match_left`, `match_right` (пары по `match_key`)            | `item_id` (левый) + `matched_item_id` |
| `open_text`       | — ; `manual: true`                                           | `text_value`; оценивает проверяющий   |

Новый тип, которому хватает этих колонок и видов элементов, — **без миграции**. Нужна новая колонка/вид элемента —
миграция (`db-schema`): enum `kind` или колонка в `questions` с default.

## definition.ts

```ts
import { z } from 'zod'
import { defineQuestion } from '../define'
import { Id, RichText, CompactText, emptyDoc } from '@dinastia/contracts/common'

export const multipleChoice = defineQuestion({
	type: 'multiple_choice',
	icon: 'ListChecks',
	uses: { columns: ['scoring'], items: ['option'] }, // check:registries: тип не трогает чужие колонки
	schema: z.object({
		prompt: RichText,
		explanation: RichText.nullable(),
		points: z.number().int().min(1).max(100),
		scoring: z.enum(['all_or_nothing', 'partial']),
		options: z
			.array(z.object({ id: Id.optional(), body: CompactText, isCorrect: z.boolean() }))
			.min(2)
			.max(20)
			.refine((o) => o.some((x) => x.isCorrect), { message: 'NEED_CORRECT_OPTION' }),
	}),
	items: { options: 'option' }, // поле схемы → question_items.kind
	defaults: () => ({ prompt: emptyDoc(), explanation: null, points: 1, scoring: 'all_or_nothing', options: [] }),
	secretKeys: ['options.*.isCorrect', 'explanation'],
	toPublic: ({ prompt, points, options }) => ({ prompt, points, options: options.map(({ isCorrect, ...o }) => o) }),
	responseSchema: z.object({ selected: z.array(Id).max(20) }), // → quiz_answer_items.item_id
	grade: (q, r) => {
		const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id))
		const hits = r.selected.filter((id) => correct.has(id)).length
		const wrong = r.selected.length - hits
		const isCorrect = hits === correct.size && wrong === 0
		const score =
			q.scoring === 'partial' ? Math.max(0, (hits - wrong) / correct.size) * q.points : isCorrect ? q.points : 0
		return { score, max: q.points, isCorrect }
	},
	review: (q) => ({ correct: q.options.filter((o) => o.isCorrect).map((o) => o.id), explanation: q.explanation }),
	shuffle: 'items', // порядок вариантов перемешивается в attempt_question_items
})
```

| Поле             | Смысл                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| `uses`           | какие колонки `questions` и виды `question_items` использует тип                 |
| `items`          | поле-массив схемы → строки `question_items` с этим `kind` (load/save ядро)       |
| `toPublic`       | что видит ученик в попытке — **без** правильных ответов; убрать все `secretKeys` |
| `responseSchema` | ответ ученика; ядро раскладывает его в `quiz_answers`/`quiz_answer_items`        |
| `grade`          | чистая детерминированная функция, только на сервере; `score` ∈ [0, max]          |
| `manual: true`   | ручная проверка: `grade` не вызывается, ответ ждёт проверяющего                  |
| `review`         | разбор, отдаётся только по правилу `show_correct` блока `quiz`                   |
| `shuffle`        | `'items'` — перемешивать элементы при снимке попытки; `false` — нет              |

## Ревизии

Вопрос, у которого есть ответы (`attempt_questions`), при сохранении правки **не меняется**: сервис создаёт копию
(`revision_of` = старый id, `is_current = true`, у старого — `false`), блоки `quiz` с `fixed`-списком переключаются на
новую ревизию. Попытки остаются со своей ревизией. Тип ничего для этого не делает — это ядро банка вопросов.

## editor.tsx / viewer.tsx

- `Editor({ value, onChange })` — в банке вопросов; помогает отметить правильный ответ, показывает ошибки схемы.
- `Viewer({ data, response, onChange, review? })` — в попытке (`data` публичные) и в разборе (`review` передан).

## Шаги

1. `pnpm gen:question <type>` (`snake_case`, неизменяем после релиза).
2. Хватает ли общих колонок и видов элементов? Нет — миграция и согласование (`db-schema`).
3. `uses`, `schema`, `items`, `toPublic`, `responseSchema`, `grade`, `review`; тесты на правильный, неправильный,
   частичный, пустой ответ и на `toPublic`.
4. Editor и Viewer, строки `packages/i18n/locales/ru/questions.json`.
5. `pnpm check`; e2e: создать вопрос в банке, пройти тест.

## Изменение проверки существующего типа

Меняет баллы у **уже сданных** попыток? Пересчёт не делается автоматически — `change-workflow`, решение человека.

## Остановись и спроси, если

- проверка требует внешнего сервиса (запуск кода, AI-оценка) — не чистая функция;
- типу нужны данные, которые не укладываются в общие таблицы (новая колонка, новый `kind`);
- тип нужен вне тестов (опрос без правильного ответа — это блок, скилл `lesson-blocks`).
