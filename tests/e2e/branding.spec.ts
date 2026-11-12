// Демо пункта 5.9а: оформление школы (сид — индиго, Inter) применено с первого кадра на входе и в кабинетах; тёмная тема —
// осветлённый оттенок; корень — тема Dinastia.
import { createSchool, expect, rootUrl, schoolUrl, test } from './fixtures.ts'

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

// PNG 16×16 — настоящий файл (как в profile.spec)
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)

test('владелец настраивает оформление: контраст, предпросмотр, сохранение, логотип, сброс', async ({
	page,
	loginAs,
}) => {
	const slug = `brand-${Date.now().toString(36)}`
	const owner = { email: `${slug}@test.local`, password: 'brand-pass-123' }
	createSchool({ slug, name: 'Школа в цвете', ...owner })
	await loginAs(owner, slug)
	await page.goto(schoolUrl(slug, '/admin/settings'))
	const section = page.getByTestId('settings-branding')
	await expect(section).toBeVisible()

	// слабый цвет: предупреждение, сохранить нельзя, подсказка подставляет читаемый оттенок
	await page.getByTestId('branding-primary').fill('#ffd400')
	await expect(page.getByTestId('branding-contrast')).toContainText('4,5:1')
	await expect(page.getByTestId('branding-save')).toBeDisabled()
	await page.getByTestId('branding-contrast-fix').click()
	await expect(page.getByTestId('branding-contrast')).toContainText('текст читается')
	const fixed = await page.getByTestId('branding-primary').inputValue()
	expect(fixed).toMatch(/^#[0-9a-f]{6}$/)

	// предпросмотр меняется до сохранения, страница — нет
	const previewPrimary = () =>
		page
			.getByTestId('branding-preview-light')
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--primary').trim())
	expect(await previewPrimary()).toBe(fixed)
	expect(await page.evaluate(token('--primary'))).not.toBe(fixed)

	await page.getByTestId('branding-font').click()
	await page.getByRole('option', { name: 'PT Serif' }).click()
	await page.getByTestId('branding-save').click()
	await expect(page.getByText('Настройки сохранены')).toBeVisible()
	// тема применилась без перезагрузки и держится после неё
	await expect.poll(() => page.evaluate(token('--primary'))).toBe(fixed)
	await page.reload()
	expect(await page.evaluate(token('--primary'))).toBe(fixed)
	expect(await page.evaluate(token('--font-sans'))).toContain('PT Serif')
	await expect(page.getByTestId('branding-preview')).toBeVisible()
	await page.screenshot(shots('5.9-settings-branding'))

	// логотип: сразу в шапке кабинета
	await page.getByTestId('branding-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
	await expect(page.getByTestId('branding-logo').getByRole('img')).toBeVisible()
	await expect(page.getByTestId('admin-school-name').getByTestId('school-logo')).toBeVisible()

	// мобильная ширина — без горизонтальной прокрутки
	await page.setViewportSize({ width: 375, height: 800 })
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	await page.screenshot(shots('5.9-settings-branding-375'))
	await page.setViewportSize({ width: 1280, height: 800 })

	// сброс к теме Dinastia
	await page.getByTestId('branding-reset').click()
	await page.getByTestId('branding-save').click()
	await expect.poll(() => page.evaluate(token('--primary'))).not.toBe(fixed)
})
