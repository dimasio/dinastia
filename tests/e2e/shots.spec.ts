// Снимки готовых экранов для просмотра глазами (скилл visual-review): `pnpm e2e:shots`, файлы — screens/ (в .gitignore).
// Каждый снимок заодно проверяет пропущенные строки i18n и горизонтальную прокрутку на 375px (shoot()).
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

test.describe('@shots', () => {
	test('вход и регистрация школы', async ({ page }) => {
		await page.goto(schoolUrl('demo', '/login'))
		await expect(page.getByRole('button', { name: 'Войти' }).first()).toBeVisible()
		await shoot(page, 'login')
		await page.goto('/register')
		await expect(page.getByTestId('schools-register-submit')).toBeVisible()
		await shoot(page, 'register')
	})

	test('сотрудники и профиль (владелец)', async ({ page, loginAs }) => {
		await loginAs('owner')
		await page.goto(schoolUrl('demo', '/admin/staff'))
		await expect(page.getByTestId('resource-staff-row').first()).toBeVisible()
		await shoot(page, 'staff')
		await page.goto(schoolUrl('demo', '/admin/profile'))
		await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
		await shoot(page, 'profile')
	})

	test('песочницы: форматированный текст, блоки, вопросы', async ({ page }) => {
		test.setTimeout(60_000) // три страницы и девять снимков: в полном прогоне под нагрузкой дольше 30 с
		await page.goto('/dev/rich-text')
		await expect(page.getByTestId('sandbox-description')).toBeVisible()
		await shoot(page, 'dev-rich-text')

		await page.goto('/dev/blocks')
		await page.getByTestId('block-palette-callout').click()
		await page.getByTestId('draft-0-body').click()
		await page.keyboard.type('Сдайте задание до пятницы')
		await page.waitForTimeout(200)
		await page.getByTestId('sandbox-publish').click()
		await expect(page.getByTestId('published-0')).toBeVisible()
		await shoot(page, 'dev-blocks')

		await page.goto('/dev/questions')
		await page.getByTestId('bank-prompt').click()
		await page.keyboard.type('Сколько будет 2 + 2?')
		await page.getByTestId('bank-option-0').click()
		await page.keyboard.type('3')
		await page.getByTestId('bank-option-1').click()
		await page.keyboard.type('4')
		await page.getByTestId('bank-correct-1').check()
		await page.waitForTimeout(200)
		await page.getByTestId('sandbox-start').click()
		await page.getByTestId('attempt-option-0').click()
		await page.getByTestId('sandbox-check').click()
		await expect(page.getByTestId('sandbox-verdict')).toBeVisible()
		await shoot(page, 'dev-questions-review')
	})
})
