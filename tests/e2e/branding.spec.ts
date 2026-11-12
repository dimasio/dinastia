// Демо пункта 5.9а: оформление школы (сид — индиго, Inter) применено с первого кадра на входе и в кабинетах; тёмная тема —
// осветлённый оттенок; корень — тема Dinastia.
import { expect, rootUrl, schoolUrl, test } from './fixtures.ts'

const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })
const token = (name: string) => `getComputedStyle(document.documentElement).getPropertyValue('${name}').trim()`

test('тема школы на входе и в кабинете, тёмная — свой оттенок; на корне — тема Dinastia', async ({ page, loginAs }) => {
	await page.goto(schoolUrl('demo', '/login'))
	await expect(page.getByTestId('login-title')).toBeVisible()
	expect(await page.evaluate(token('--primary'))).toBe('#4f46e5')
	expect(await page.evaluate(token('--font-sans'))).toContain('Inter Variable')
	const button = page.getByRole('button', { name: 'Войти' }).first()
	expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(79, 70, 229)')
	await page.screenshot(shots('5.9-login-branded'))

	await loginAs('student')
	await page.goto(schoolUrl('demo', '/learn'))
	await expect(page.getByTestId('learn-school-name')).toContainText('Демо')
	expect(await page.evaluate(token('--primary'))).toBe('#4f46e5')

	// тёмная тема: цвет школы осветлён до читаемого на тёмном фоне
	await page.evaluate(() => document.documentElement.classList.add('dark'))
	const dark = await page.evaluate(token('--primary'))
	expect(dark).toMatch(/^#[0-9a-f]{6}$/)
	expect(dark).not.toBe('#4f46e5')
	await page.screenshot(shots('5.9-learn-branded-dark'))

	await page.goto(rootUrl('/'))
	expect(await page.evaluate(token('--primary'))).not.toBe('#4f46e5')
})
