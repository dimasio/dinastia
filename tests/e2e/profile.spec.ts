// Демо пункта 1.7: загрузка аватара — профиль → файл в S3 напрямую → аватар в меню и в списке сотрудников.
import { expect, schoolUrl, test } from './fixtures.ts'

const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

// PNG 16×16 (синий) — настоящий файл
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)

test('куратор загружает аватар и видит его в меню', async ({ page, loginAs }) => {
	await loginAs('curator')
	await page.goto(schoolUrl('demo', '/admin'))
	await page.getByTestId('user-menu').click()
	await page.getByTestId('user-menu-profile').click()
	await expect(page).toHaveURL(/\/admin\/profile$/)
	await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
	// с чистого листа: аватар мог остаться с прошлого прогона
	const field = page.getByTestId('profile-avatar')
	if (await page.getByTestId('profile-avatar-remove').isVisible())
		await page.getByTestId('profile-avatar-remove').click()
	await expect(field.getByRole('img')).toHaveCount(0)

	// неподходящий файл — понятная ошибка до загрузки
	await page
		.getByTestId('profile-avatar-file')
		.setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: png })
	await expect(page.getByTestId('profile-avatar-error')).toHaveText('Такой тип файла здесь не подходит.')

	await page.getByTestId('profile-avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png })
	await expect(field.getByRole('progressbar')).toHaveCount(0)
	await expect(field.getByRole('img')).toBeVisible()
	await expect(page.getByTestId('user-menu').getByRole('img')).toBeVisible() // меню обновилось без перезагрузки
	await page.screenshot(shots('1.7-profile-avatar'))

	// после перезагрузки — на месте (ссылка подписанная, из S3)
	await page.reload()
	await expect(page.getByTestId('profile-avatar').getByRole('img')).toBeVisible()
	const src = await page.getByTestId('profile-avatar').getByRole('img').getAttribute('src')
	expect(src).toContain('X-Amz-Signature')
	// убрать — снова инициалы
	await page.getByTestId('profile-avatar-remove').click()
	await expect(page.getByTestId('profile-avatar').getByRole('img')).toHaveCount(0)
	await page.getByTestId('profile-avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png })
	await expect(page.getByTestId('profile-avatar').getByRole('img')).toBeVisible()
})

test('аватар куратора виден администратору в списке сотрудников', async ({ page, loginAs }) => {
	await loginAs('admin')
	await page.goto(schoolUrl('demo', '/admin/staff'))
	const curator = page.getByTestId('resource-staff-row').filter({ hasText: 'curator@demo.local' })
	await expect(curator.getByRole('img')).toBeVisible()
	await page.screenshot(shots('1.7-staff-avatars'))
})

test('ученик открывает профиль в своей области', async ({ page, loginAs }) => {
	await loginAs('student')
	await page.goto(schoolUrl('demo', '/learn'))
	await page.getByTestId('user-menu').click()
	await page.getByTestId('user-menu-profile').click()
	await expect(page).toHaveURL(/\/learn\/profile$/)
	await expect(page.getByTestId('profile-avatar-file')).toBeAttached()
})
