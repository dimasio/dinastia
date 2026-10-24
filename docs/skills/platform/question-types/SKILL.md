---
name: question-types
description: Реестр типов вопросов теста Dinastia (packages/questions) — новый тип через pnpm gen:question <type>: definition.ts с defineQuestion (type, версия, zod-схема с правильным ответом, defaults, toPublic без ответа, responseSchema ответа ученика, grade(data, response) → score/max/correct/feedback, manual для ручной проверки, migrations), editor.tsx в банке вопросов, viewer.tsx в попытке и разборе, регистрация, проверка check:registries. Использовать для «новый тип вопроса», «сопоставление/порядок/пропуски/числовой ответ», «частичные баллы», «поменять проверку ответа».
---

# Типы вопросов

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.4).

Вопрос хранится в `questions` (`type`, `v`, `data`) банка курса и используется блоком `quiz` (скилл
`lms-assessments`). Устройство реестра — как у блоков (скилл `lesson-blocks`): `definition.ts` изоморфен,
`editor.tsx`/`viewer.tsx` — клиентские.

## definition.ts

```ts
import { z } from 'zod'
import { defineQuestion } from '../define'
import { RichText, emptyDoc } from '@dinastia/contracts/common'

const Option = z.object({ id: z.string(), text: RichText })

export const multipleChoice = defineQuestion({
  type: 'multiple_choice',
  v: 1,
  icon: 'ListChecks',
  schema: z.object({
    prompt: RichText,
    options: z.array(Option).min(2).max(20),
    correct: z.array(z.string()).min(1),         // id правильных вариантов
    scoring: z.enum(['all_or_nothing', 'partial']).default('all_or_nothing'),
    points: z.number().int().min(1).default(1),
    explanation: RichText.optional(),            // показывается в разборе
  }).refine((d) => d.correct.every((id) => d.options.some((o) => o.id === id)), { path: ['correct'] }),
  defaults: () => ({ prompt: emptyDoc(), options: [], correct: [], scoring: 'all_or_nothing', points: 1 }),
  secretKeys: ['correct', 'explanation'],
  toPublic: ({ prompt, options, points }) => ({ prompt, options, points }),
  responseSchema: z.object({ selected: z.array(z.string()) }),
  grade: (d, r) => {
    const sel = new Set(r.selected)
    const hits = d.correct.filter((id) => sel.has(id)).length
    const wrong = r.selected.filter((id) => !d.correct.includes(id)).length
    const correct = hits === d.correct.length && wrong === 0
    const score = d.scoring === 'partial'
      ? Math.max(0, (hits - wrong) / d.correct.length) * d.points
      : correct ? d.points : 0
    return { score, max: d.points, correct }
  },
  review: (d) => ({ correct: d.correct, explanation: d.explanation }),  // что раскрыть в разборе по show_correct
})
```

| Поле | Смысл |
|---|---|
| `toPublic` | что видит ученик в попытке — **без** ответов; обязательно убрать все `secretKeys` |
| `responseSchema` | форма ответа ученика; невалидный ответ — 400 |
| `grade` | чистая детерминированная функция, только на сервере; `score` ∈ [0, max] |
| `manual: true` | ручная проверка (`open_text`): `grade` не вызывается, ответ ждёт проверяющего |
| `review` | данные разбора, отдаются только по правилу `show_correct` блока `quiz` |
| `shuffle` | (необязательно) `(publicData, rnd) => publicData` — как перемешивать варианты; вызывается при снимке попытки |

## editor.tsx / viewer.tsx

- `Editor({ value, onChange })` — в банке вопросов; помогает задать правильный ответ, показывает ошибки схемы.
- `Viewer({ data, response, onChange, review? })` — в попытке (`data` публичные) и в разборе (`review` передан).
- Тесты компонентов — не обязательны; тест `grade` и `toPublic` — обязателен.

## Шаги

1. `pnpm gen:question <type>` (`snake_case`, неизменяем после релиза).
2. Схема, `toPublic`, `responseSchema`, `grade`, `review`; тест на правильный, неправильный, частичный, пустой ответ.
3. Editor и Viewer, строки `packages/i18n/locales/ru/questions.json`.
4. `pnpm check`; e2e: создать вопрос в банке, пройти тест.

## Изменение проверки существующего типа

Меняет баллы у **уже сданных** попыток? Пересчёт не делается автоматически — `change-workflow`, решение человека.

## Остановись и спроси, если

- проверка требует внешнего сервиса (запуск кода, AI-оценка) — не чистая функция;
- тип нужен вне тестов (опрос без правильного ответа — это блок, скилл `lesson-blocks`).
