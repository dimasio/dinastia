// Банк вопросов курса (карточка 3.1): вкладка «Вопросы», создание вопроса с тегами, предпросмотр глазами ученика, поиск и
// фильтр по тегу, правка, теги курса (переименование), архив; куратор — только чтение.
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Банк ${run}`

async function addQuestion(
	page: import('@playwright/test').Page,
	prompt: string,
	wrong: string,
	right: string,
	tag: string,
) {
	await page.getByTestId('resource-questions-create').click()
	await page.getByTestId('resource-questions-create-form-submit').click()
	await expect(page.getByTestId('question-editor')).toBeVisible()
	await page.getByTestId('question-prompt').click()
	await page.keyboard.type(prompt)
	await page.getByTestId('question-option-0').click()
	await page.keyboard.type(wrong)
	await page.getByTestId('question-option-1').click()
	await page.keyboard.type(right)
	await page.getByTestId('question-correct-1').check()
	await page.getByTestId('question-tags-input').fill(tag)
	await page.getByTestId('question-tags-input').press('Enter')
	await expect(page.getByTestId('question-invalid')).toHaveCount(0)
	await page.getByTestId('question-save').click()
	await expect(page.getByTestId('resource-questions')).toBeVisible()
}

test('банк вопросов: создать, найти, править, теги, архив', async ({ page, loginAs }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await page.getByTestId('resource-courses-create').click()
	await page.getByTestId('resource-courses-create-form').getByLabel('Название').fill(COURSE)
	await page.getByTestId('resource-courses-create-form-submit').click()
	await page.getByRole('link', { name: COURSE }).click()
	await page.getByTestId('course-tab-questions').click()
	await expect(page.getByText('В банке пока нет вопросов')).toBeVisible()

	await test.step('новый вопрос: тип, формулировка, варианты, тег; сохранить нельзя, пока неполно', async () => {
		await page.getByTestId('resource-questions-create').click()
		await page.getByTestId('resource-questions-create-form-submit').click()
		await expect(page.getByTestId('question-editor')).toBeVisible()
		await expect(page.getByTestId('question-save')).toBeDisabled()
		await page.getByTestId('question-prompt').click()
		await page.keyboard.type('Сколько будет 2 + 2?')
		await page.getByTestId('question-option-0').click()
		await page.keyboard.type('3')
		await page.getByTestId('question-option-1').click()
		await page.keyboard.type('4')
		await page.getByTestId('question-correct-1').check()
		await page.getByTestId('question-tags-input').fill('Арифметика')
		await page.getByTestId('question-tags-input').press('Enter')
		await expect(page.getByTestId('question-tags-chip')).toHaveText('Арифметика')

		await page.getByTestId('question-preview-toggle').click()
		const preview = page.getByTestId('question-preview')
		await expect(preview).toContainText('Сколько будет 2 + 2?')
		await expect(preview).not.toContainText('Верный') // ответ ученику не показывается
		await shoot(page, 'question-editor')

		await page.getByTestId('question-save').click()
		await expect(page.getByTestId('resource-questions-row')).toHaveCount(1)
	})

	await test.step('второй вопрос; поиск и фильтр по тегу', async () => {
		await addQuestion(page, 'Столица Франции?', 'Лион', 'Париж', 'География')
		await expect(page.getByTestId('resource-questions-row')).toHaveCount(2)
		await page.getByTestId('resource-questions-search').fill('Франции')
		await expect(page.getByTestId('resource-questions-row')).toHaveCount(1)
		await expect(page.getByTestId('resource-questions-row')).toContainText('География')
		await page.getByTestId('resource-questions-search').fill('')
		await expect(page.getByTestId('resource-questions-row')).toHaveCount(2)
		await shoot(page, 'question-bank')
	})

	await test.step('правка вопроса и теги курса', async () => {
		await page.getByRole('link', { name: 'Столица Франции?' }).click()
		await page.getByTestId('question-points').fill('3')
		// уведомление «Вопрос сохранён» могло остаться от создания: ждём ответа на правку, иначе «Назад» спросит про несохранённое
		const saved = page.waitForResponse((r) => r.url().endsWith('/assessments/questions/update') && r.ok())
		await page.getByTestId('question-save').click()
		await saved
		await expect(page.getByText('Вопрос сохранён').first()).toBeVisible()
		await expect(page.getByTestId('question-save')).toBeDisabled()
		await page.getByTestId('question-back').click()
		await expect(page.getByTestId('resource-questions-row').filter({ hasText: 'Столица Франции?' })).toContainText('3')

		await page.getByTestId('bank-tags').click()
		const row = page.getByTestId('tag-row').nth(1) // по алфавиту: Арифметика, География
		await row.getByTestId('tag-name').fill('Страны')
		await row.getByTestId('tag-save').click()
		await page.keyboard.press('Escape')
		await expect(page.getByTestId('resource-questions-row').filter({ hasText: 'Столица Франции?' })).toContainText(
			'Страны',
		)
	})

	await test.step('архив', async () => {
		const row = page.getByTestId('resource-questions-row').filter({ hasText: 'Сколько будет 2 + 2?' })
		await row.getByTestId('resource-questions-row-actions').click()
		await page.getByRole('menuitem', { name: 'В архив' }).click()
		await page.getByRole('button', { name: 'В архив' }).click()
		await expect(page.getByTestId('resource-questions-row')).toHaveCount(1)
	})
})

test('куратор читает банк, но не правит', async ({ page, loginAs }) => {
	await loginAs('curator')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await page.getByTestId('resource-courses-search').fill('Основы акварели')
	await page.getByRole('link', { name: 'Основы акварели', exact: true }).click()
	await page.getByTestId('course-tab-questions').click()
	await expect(page.getByTestId('resource-questions')).toBeVisible()
	await expect(page.getByTestId('resource-questions-create')).toHaveCount(0)
	await expect(page.getByTestId('bank-tags')).toBeVisible()
})
