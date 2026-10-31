// Вопросы (пункт 1.4): редактор в банке (QuestionEditorHost) → попытка по публичным данным → проверка → разбор.
// Песочница /dev/questions — только в режиме разработки.
import { expect, test } from '@playwright/test'

test('один вариант: составить вопрос, пройти, проверить, увидеть разбор', async ({ page }) => {
	await page.goto('/dev/questions')
	const prompt = page.getByTestId('bank-prompt')
	await expect(prompt).toBeVisible()
	await prompt.click()
	await page.keyboard.type('Сколько будет 2 + 2?')
	await page.getByTestId('bank-option-0').click()
	await page.keyboard.type('3')
	await page.getByTestId('bank-option-1').click()
	await page.keyboard.type('4')

	// верным по умолчанию отмечен первый — переносим отметку на «4»
	await page.getByTestId('bank-correct-1').check()
	await page.getByTestId('bank-add-option').click()
	await page.getByTestId('bank-option-2').click()
	await page.keyboard.type('5')
	await page.getByTestId('bank-points').fill('2')
	await page.getByTestId('bank-explanation').click()
	await page.keyboard.type('Два плюс два — четыре.')
	await expect(page.getByTestId('bank-invalid')).toHaveCount(0)
	await page.waitForTimeout(300) // хост отдаёт значение с задержкой (delayMs)

	await page.getByTestId('sandbox-start').click()
	const attempt = page.getByTestId('attempt')
	await expect(attempt).toContainText('Сколько будет 2 + 2?')
	await expect(attempt.locator('[data-correct]')).toHaveCount(0) // в попытке верный ответ не виден
	await expect(attempt).not.toContainText('Два плюс два — четыре.') // и пояснение тоже

	await page.getByTestId('attempt-option-0').click() // «3» — неверно
	await page.getByTestId('sandbox-check').click()
	await expect(page.getByTestId('sandbox-verdict')).toHaveText('Неверно')
	await expect(page.getByTestId('sandbox-score')).toHaveText('0 из 2')
	await expect(page.getByTestId('attempt-option-1')).toHaveAttribute('data-correct', 'true')
	await expect(page.getByTestId('attempt-option-0')).toHaveAttribute('data-wrong-choice', 'true')
	await expect(page.getByLabel('Ваш ответ — неверный')).toBeVisible()
	await expect(page.getByTestId('attempt-explanation')).toContainText('Два плюс два — четыре.')

	await page.getByRole('button', { name: 'Ещё раз' }).click()
	await page.getByTestId('attempt-option-1').click()
	await page.getByTestId('sandbox-check').click()
	await expect(page.getByTestId('sandbox-verdict')).toHaveText('Верно')
	await expect(page.getByTestId('sandbox-score')).toHaveText('2 из 2')
})

test('без верного варианта — понятная ошибка в редакторе', async ({ page }) => {
	await page.goto('/dev/questions')
	await expect(page.getByTestId('bank-prompt')).toBeVisible()
	await page.getByTestId('bank-add-option').click()
	await page.getByRole('button', { name: 'Удалить вариант 1' }).click() // удалили единственный верный
	await expect(page.getByTestId('bank-invalid')).toHaveText('Отметьте ровно один верный вариант')
})
