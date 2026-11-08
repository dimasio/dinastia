// Типы вопросов 3.2 (карточка 3.2): в песочнице /dev/questions составить вопрос каждого типа, пройти, проверить и увидеть
// разбор. Проверка в песочнице — в браузере ради демо; в продукте она только на сервере (покрыта тестами api и пакета).
import { expect, type Page, test } from '@playwright/test'
import { shoot } from './shots.ts'

async function compose(page: Page, type: string, prompt: string) {
	await page.goto('/dev/questions')
	await page.getByTestId('sandbox-type').selectOption(type)
	const p = page.getByTestId('bank-prompt')
	await expect(p).toBeVisible()
	await p.click()
	await page.keyboard.type(prompt)
}

async function start(page: Page) {
	await expect(page.getByTestId('bank-invalid')).toHaveCount(0)
	await page.waitForTimeout(300) // хост отдаёт значение с задержкой (delayMs)
	await page.getByTestId('sandbox-start').click()
	await expect(page.getByTestId('attempt')).toBeVisible()
}

const verdict = (page: Page) => page.getByTestId('sandbox-verdict')
const score = (page: Page) => page.getByTestId('sandbox-score')

test('несколько вариантов: частичный балл', async ({ page }) => {
	await compose(page, 'multiple_choice', 'Какие числа чётные?')
	await page.getByTestId('bank-option-0').click()
	await page.keyboard.type('Два')
	await page.getByTestId('bank-option-1').click()
	await page.keyboard.type('Три')
	await page.getByTestId('bank-add-option').click()
	await page.getByTestId('bank-option-2').click()
	await page.keyboard.type('Четыре')
	await page.getByTestId('bank-correct-2').check() // верные: «Два» и «Четыре»
	await page.getByTestId('bank-scoring-partial').check()
	await page.getByTestId('bank-points').fill('4')
	await start(page)

	await page.getByTestId('attempt-option-0').click()
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Неверно')
	await expect(score(page)).toHaveText('2 из 4') // половина верных
	await expect(page.getByTestId('attempt-option-2')).toHaveAttribute('data-correct', 'true')
	await page.getByRole('button', { name: 'Ещё раз' }).click()

	await page.getByTestId('attempt-option-0').click()
	await page.getByTestId('attempt-option-2').click()
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
	await expect(score(page)).toHaveText('4 из 4')
	await shoot(page, 'question-multiple-choice')
})

test('ответ текстом: регистр, пробелы и «ё» не важны; в разборе — допустимые ответы', async ({ page }) => {
	await compose(page, 'text_input', 'Какое животное мяукает?')
	await page.getByTestId('bank-accepted-0').fill('Кошка')
	await page.getByTestId('bank-add-accepted').click()
	await page.getByTestId('bank-accepted-1').fill('кот*')
	await start(page)

	await page.getByTestId('attempt-input').fill('  КОШКА ')
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
	await page.getByRole('button', { name: 'Ещё раз' }).click()

	await page.getByTestId('attempt-input').fill('Собака')
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Неверно')
	await expect(page.getByTestId('attempt-accepted')).toHaveText(/Кошка · кот\*/)
	await page.getByRole('button', { name: 'Ещё раз' }).click()

	await page.getByTestId('attempt-input').fill('котёнок') // шаблон «кот*»
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
})

test('число: допуск, запятая как разделитель', async ({ page }) => {
	await compose(page, 'number', 'Чему равно π с точностью до сотых?')
	await page.getByTestId('bank-answer').fill('3.14')
	await page.getByTestId('bank-tolerance').fill('0.01')
	await start(page)

	await page.getByTestId('attempt-input').fill('3,15')
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
	await page.getByRole('button', { name: 'Ещё раз' }).click()

	await page.getByTestId('attempt-input').fill('3,5')
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Неверно')
	await expect(page.getByTestId('attempt-answer')).toContainText('3,14 ± 0,01')
})

/** Расставить элементы попытки в указанный порядок кнопками «Выше». */
async function arrange(page: Page, order: string[]) {
	const texts = async () => page.locator('[data-testid^="attempt-step-"]').allTextContents()
	for (const [target, title] of order.entries()) {
		const now = await texts()
		const from = now.findIndex((x) => x.includes(title))
		for (let i = from; i > target; i--) await page.getByTestId(`attempt-up-${i}`).click()
	}
}

async function composeOrdering(page: Page) {
	await compose(page, 'ordering', 'Расставьте этапы по порядку')
	await page.getByTestId('bank-step-0').click()
	await page.keyboard.type('Эскиз')
	await page.getByTestId('bank-step-1').click()
	await page.keyboard.type('Заливка')
	await page.getByTestId('bank-add-step').click()
	await page.getByTestId('bank-step-2').click()
	await page.keyboard.type('Детали')
	await page.getByTestId('bank-scoring-partial').check()
	await page.getByTestId('bank-points').fill('3')
	await start(page)
}

test('порядок: верная расстановка', async ({ page }) => {
	await composeOrdering(page)
	await arrange(page, ['Эскиз', 'Заливка', 'Детали'])
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
	await expect(score(page)).toHaveText('3 из 3')
	await shoot(page, 'question-ordering')
})

test('порядок: частичный балл, в разборе — места и верный порядок', async ({ page }) => {
	await composeOrdering(page)
	await arrange(page, ['Эскиз', 'Детали', 'Заливка']) // на месте только «Эскиз»
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Неверно')
	await expect(score(page)).toHaveText('1 из 3')
	await expect(page.locator('[data-testid^="attempt-step-"][data-correct="true"]')).toHaveCount(1)
	await expect(page.getByTestId('attempt-correct-order')).toContainText('Заливка')
})

test('соответствие: пары, частичный балл, подсказка верной пары', async ({ page }) => {
	await compose(page, 'matching', 'Сопоставьте страны и столицы')
	await page.getByTestId('bank-left-0').click()
	await page.keyboard.type('Франция')
	await page.getByTestId('bank-right-0').click()
	await page.keyboard.type('Париж')
	await page.getByTestId('bank-left-1').click()
	await page.keyboard.type('Италия')
	await page.getByTestId('bank-right-1').click()
	await page.keyboard.type('Рим')
	await page.getByTestId('bank-scoring-partial').check()
	await page.getByTestId('bank-points').fill('2')
	await start(page)

	await page.getByTestId('attempt-select-0').selectOption({ label: 'Париж' })
	await page.getByTestId('attempt-select-1').selectOption({ label: 'Париж' })
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Неверно')
	await expect(score(page)).toHaveText('1 из 2')
	await expect(page.getByTestId('attempt-correct-1')).toHaveText('Рим')
	await page.getByRole('button', { name: 'Ещё раз' }).click()

	await page.getByTestId('attempt-select-0').selectOption({ label: 'Париж' })
	await page.getByTestId('attempt-select-1').selectOption({ label: 'Рим' })
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveText('Верно')
	await expect(score(page)).toHaveText('2 из 2')
})

test('развёрнутый ответ: поле ввода, проверка вручную', async ({ page }) => {
	await compose(page, 'open_text', 'Опишите свой первый рисунок')
	await start(page)
	await page.getByTestId('attempt-input').fill('Это был пейзаж.')
	await expect(page.getByTestId('attempt-input')).toHaveValue('Это был пейзаж.')
	// ручная проверка: автоматической оценки нет
	await page.getByTestId('sandbox-check').click()
	await expect(verdict(page)).toHaveCount(0)
})

test('тип без секретов: в попытке верные варианты не помечены', async ({ page }) => {
	await compose(page, 'multiple_choice', 'Выберите верное')
	await page.getByTestId('bank-option-0').click()
	await page.keyboard.type('А')
	await page.getByTestId('bank-option-1').click()
	await page.keyboard.type('Б')
	await start(page)
	await expect(page.locator('[data-correct]')).toHaveCount(0)
})
