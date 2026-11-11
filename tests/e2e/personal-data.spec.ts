// Персональные данные (карточка 5.5): реквизиты оператора ПДн в настройках школы, типовая политика школы, согласие при
// присоединении (флажок обязателен), документы Dinastia на корневом домене.
import { expect, schoolUrl, test } from './fixtures.ts'

const run = Date.now().toString(36)
const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

test('администратор указывает оператора ПДн — он виден в политике школы', async ({ page, loginAs }) => {
	await loginAs('admin')
	await page.goto(schoolUrl('demo', '/admin/settings'))
	const legal = page.getByTestId('settings-schools-legal')
	const operator = `ООО «Демо ${run}», ИНН 0000000000`
	await legal.getByTestId('setting-schools-pdOperator').fill(operator)
	await legal.getByTestId('setting-schools-pdContact').fill('pd@demo.local')
	await legal.getByTestId('setting-schools-privacyUrl').fill('')
	await legal.getByTestId('settings-save').click()
	await expect(page.getByText('Настройки сохранены')).toBeVisible()
	await page.screenshot(shots('5.5-settings'))

	await page.goto(schoolUrl('demo', '/legal/privacy'))
	await expect(page.getByTestId('legal-doc')).toContainText(operator)
	await expect(page.getByTestId('legal-doc')).toContainText('pd@demo.local')
	await expect(page.getByTestId('legal-draft')).toBeVisible()
	await page.screenshot(shots('5.5-school-privacy'))
})

test('документы Dinastia на корневом домене; ссылки из регистрации школы', async ({ page }) => {
	await page.goto('http://dinastia.localhost:5173/legal/offer')
	await expect(page.getByTestId('legal-doc')).toContainText('Оферта на использование платформы Dinastia')
	await page.goto('http://dinastia.localhost:5173/legal/privacy')
	await expect(page.getByTestId('legal-doc')).toContainText('Политика обработки персональных данных Dinastia')
})
