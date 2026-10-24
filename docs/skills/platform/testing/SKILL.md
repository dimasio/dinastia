---
name: testing
description: Тесты Dinastia — unit на Vitest рядом с кодом (*.test.ts — чистые функции, grade, evaluate, toPublic, миграции блоков), интеграционные на реальном Postgres (фикстура withTestSchool с ролями, callAs(role, procedure, input), expectPermissionMatrix, изоляция школ, подмена времени), e2e-сценарии Playwright в tests/e2e (фикстуры школы и входа по роли, локаторы getByRole/getByTestId, соглашение data-testid <модуль>-<элемент>, сценарий фичи и демо фазы), запуск pnpm test / pnpm e2e, что тестировать обязательно. Использовать для «напиши тест», «проверь сценарий», «e2e», «тест прав» — аналог сценариев «Ариадны» GaskarFM.
---

# Тесты

> Статус: целевой — сверить с кодом в фазе 0 (0.3, 0.8) и 1 (1.9).

Интеграционные тесты — на настоящей БД (D-015): RLS и SQL моками не проверяются.

## Что обязательно

| Изменение               | Тест                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| сервисная логика        | интеграционный: результат + побочные эффекты (события, задачи)                                         |
| процедура               | матрица прав: роли с правом — ок, без права — 403                                                      |
| политика «только свои»  | куратор/ученик не видит чужое (`notFound`)                                                             |
| новая тенантная таблица | изоляция школ — генерируется `check:registries` автоматически                                          |
| блок / тип вопроса      | схема, `defaults`, `toPublic` без секретов, `evaluate`/`grade`; для блока — `save → load → copy` на БД |
| задача / подписчик      | выполнение + идемпотентность (двойной запуск)                                                          |
| фича с UI               | e2e-сценарий основного пути                                                                            |

## Unit

```ts
// packages/questions/src/multiple_choice/multiple_choice.test.ts
import { describe, it, expect } from 'vitest'
import { multipleChoice as q } from './definition'

describe('multiple_choice', () => {
  const data = q.parse({ …, correct: ['a', 'c'], scoring: 'partial', points: 2 })
  it('скрывает ответы', () => expect(q.toPublic(data)).not.toHaveProperty('correct'))
  it('частичный балл', () => expect(q.grade(data, { selected: ['a'] }).score).toBe(1))
})
```

## Интеграционные

```ts
// apps/api/src/modules/courses/courses.test.ts
import { withTestSchool, callAs, expectPermissionMatrix } from '#/test'

describe('courses', () => {
	const t = withTestSchool() // школа + участники всех ролей, транзакция откатывается после теста

	it('публикация курса эмитит событие', async () => {
		const c = await callAs(t.teacher, 'courses.create', { title: 'Курс' })
		await callAs(t.teacher, 'courses.publish', { id: c.id })
		expect(t.events).toContainEqual(expect.objectContaining({ name: 'course.published' }))
	})

	it('права', () =>
		expectPermissionMatrix(
			t,
			'courses.publish',
			{ id: t.fixtures.courseId },
			{
				allow: ['owner', 'admin', 'teacher'],
				deny: ['curator', 'student'],
			},
		))
})
```

Хелперы (`apps/api/src/test`): `withTestSchool()`, `t.other` (вторая школа), `callAs`, `t.clock.set(date)`,
`t.events`, `t.jobs.drain()` (выполнить поставленные задачи), `t.mail.sent`, фабрики `make.course(t, {...})`.

## E2E (Playwright)

```ts
// tests/e2e/assessments/review-flow.spec.ts
import { test, expect } from '../fixtures'

test('куратор возвращает ДЗ на доработку', async ({ school, loginAs, page }) => {
	const { submissionId } = await school.seed.submittedAssignment()
	await loginAs('curator')
	await page.goto('/admin/assessments/review')
	await page.getByTestId(`assessments-review-row-${submissionId}`).click()
	await page.getByRole('textbox', { name: 'Комментарий' }).fill('Добавьте пример')
	await page.getByRole('button', { name: 'Вернуть на доработку' }).click()
	await expect(page.getByText('Отправлено на доработку')).toBeVisible()
})
```

- Фикстуры: `school` (новая школа на тест, сиды через API ядра), `loginAs(role)` (сессия без UI-входа).
- Локаторы: `getByRole` с доступным именем → `getByTestId` → никогда CSS-классы и XPath.
- `data-testid`: `<модуль>-<элемент>[-<id>]` (`courses-lesson-publish`, `learn-block-<blockId>`).
- Демо фазы — `tests/e2e/phase-<N>.spec.ts`.
- Ученик в e2e проверяет и API: ответ `learn.*` не содержит секретов (D-020).

## Запуск

`pnpm test` (все), `pnpm test -- courses` (фильтр), `pnpm e2e -- review-flow`, `pnpm e2e --ui` (отладка).
Тестовая БД — отдельная (`DATABASE_URL_TEST`), поднимается compose (скилл `local-env`).

## Правила

Существующие тесты не ослаблять и не удалять ради прохождения — сообщить человеку. Флейки не «лечатся» ретраями:
найти причину (ожидание по событию, а не по времени).

## Остановись и спроси, если

- тест падает на коде, который ты не менял;
- для теста нужна внешняя система (Kinescope, почта) — используй фейк ядра; нет фейка — запрос к ядру.
