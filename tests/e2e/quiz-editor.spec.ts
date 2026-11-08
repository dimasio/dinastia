// Блок «Тест» в конструкторе урока (карточка 3.3, часть а): добавить блок, выбрать вопросы из банка (поиск, тег),
// настроить попытки, время и показ ответов, «Как увидит ученик», публикация; случайные по тегам.
import { expect, openNewLesson, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const single = (prompt: string) => ({
	prompt: doc(prompt),
	explanation: null,
	points: 1,
	options: [
		{ body: doc('Верно'), isCorrect: true },
		{ body: doc('Неверно'), isCorrect: false },
	],
})

test('тест: выбрать вопросы, настроить, предпросмотр, публикация', async ({ page, loginAs }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Проверка знаний')
	const courseId = /\/courses\/([0-9a-f-]{36})/.exec(page.url())?.[1] as string
	expect(courseId).toBeTruthy()

	// вопросы банка — через API страницы (создание вопроса в интерфейсе проверяет question-bank.spec)
	await page.evaluate(
		async ([id, questions]) => {
			for (const [prompt, tag, data] of questions as [string, string, unknown][])
				await fetch(`/api/v1/courses/${id}/questions`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ type: 'single_choice', data, tags: [tag] }),
				}).then((r) => {
					if (!r.ok) throw new Error(`${prompt}: ${r.status}`)
				})
		},
		[
			courseId,
			[
				['Сколько будет 2 + 2?', 'Арифметика', single('Сколько будет 2 + 2?')],
				['Столица Франции?', 'География', single('Столица Франции?')],
				['Сколько рёбер у куба?', 'Геометрия', single('Сколько рёбер у куба?')],
			],
		] as const,
	)

	await page.getByTestId('block-palette-quiz').click()
	const block = page.getByTestId('lesson-block').last()
	await expect(block.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: в тесте нет вопросов')

	await test.step('вручную: поиск и тег, добавить, порядок, убрать', async () => {
		await block.getByTestId(/-pick$/).click()
		const picker = block.getByTestId(/-picker$/)
		await expect(picker.getByTestId(/-picker-row$/)).toHaveCount(3)
		await picker.getByTestId(/-picker-search$/).fill('Франции')
		await expect(picker.getByTestId(/-picker-row$/)).toHaveCount(1)
		await picker.getByTestId(/-picker-add$/).click()
		await expect(picker.getByTestId(/-picker-add$/)).toHaveText('Добавлен')
		await picker.getByTestId(/-picker-search$/).fill('')
		await picker.getByTestId(/-picker-tag$/).selectOption('Арифметика')
		await expect(picker.getByTestId(/-picker-row$/)).toHaveCount(1)
		await picker.getByTestId(/-picker-add$/).click()
		await expect(block.getByTestId(/-question$/)).toHaveCount(2)
		await expect(block.getByTestId(/-question$/).first()).toContainText('Столица Франции?')
		await block.getByRole('button', { name: 'Опустить вопрос 1' }).click()
		await expect(block.getByTestId(/-question$/).first()).toContainText('Сколько будет 2 + 2?')
		await expect(block.getByTestId('lesson-block-issues')).toHaveCount(0)
	})

	await test.step('настройки: попытки, проходной балл, время, показ ответов', async () => {
		await block.getByTestId(/-attempts$/).fill('2')
		await block.getByTestId(/-pass$/).fill('75')
		await block.getByTestId(/-time-on$/).check()
		await block.getByTestId(/-time$/).fill('10')
		await block.getByTestId(/-shuffle-questions$/).check()
		await block.getByTestId(/-show$/).selectOption('after_pass')
		await shoot(page, 'quiz-editor')
		await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 })
	})

	await test.step('после перезагрузки всё на месте; «Как увидит ученик»', async () => {
		await page.reload()
		const again = page.getByTestId('lesson-block').last()
		await expect(again.getByTestId(/-question$/)).toHaveCount(2)
		await expect(again.getByTestId(/-attempts$/)).toHaveValue('2')
		await expect(again.getByTestId(/-time$/)).toHaveValue('10')
		await expect(again.getByTestId(/-show$/)).toHaveValue('after_pass')
		await page.getByTestId('lesson-mode-preview').click()
		const preview = page.getByTestId('lesson-preview')
		await expect(preview).toContainText('2 вопроса')
		await expect(preview).toContainText('Проходной балл — 75%')
		await expect(preview).toContainText('Время — 10 мин')
		await expect(preview).toContainText('2 попытки')
		await page.getByTestId('lesson-mode-editor').click()
	})

	await test.step('публикация урока', async () => {
		await page.getByTestId('lesson-publish').click()
		await expect(page.getByTestId('lesson-status')).toHaveAttribute('data-status', 'published')
	})

	await test.step('случайные по тегам', async () => {
		await page.getByTestId('block-palette-quiz').click()
		const block2 = page.getByTestId('lesson-block').last()
		await block2.getByTestId(/-selection-random_by_tags$/).check()
		await expect(block2.getByTestId('lesson-block-issues')).toHaveText(
			'Не заполнено: не выбраны теги для случайных вопросов',
		)
		await block2.getByTestId(/-tag-География$/).check()
		await block2.getByTestId(/-tag-Геометрия$/).check()
		await expect(block2.getByTestId('lesson-block-issues')).toHaveCount(0)
		await expect(block2.getByTestId(/-random$/)).toContainText('Подходит вопросов в банке: 2')
		await block2.getByTestId(/-count$/).fill('2')
		await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 })
	})
})
