// Меню областей из реестра фич (пункт 1.1): у сотрудников — сайдбар, у ученика — верхняя панель.
import { expect, schoolUrl, test } from './fixtures.ts'

test('сотрудник видит меню кабинета школы', async ({ page, loginAs }) => {
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin'))
	await expect(page.getByTestId('nav-admin').first()).toHaveText(/Главная/)
})

test('ученик видит «Мои курсы» в верхней панели', async ({ page, loginAs }) => {
	await loginAs('student')
	await page.goto(schoolUrl('demo', '/learn'))
	await expect(
		page.getByRole('navigation', { name: 'Обучение' }).getByRole('link', { name: 'Мои курсы' }),
	).toBeVisible()
})
