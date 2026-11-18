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

test('слушатель не видит «Другие учебные центры», сотрудник — видит', async ({ page, loginAs }) => {
	await loginAs('student')
	await page.goto(schoolUrl('demo', '/learn'))
	await page.getByTestId('user-menu').click()
	await expect(page.getByTestId('user-menu-sign-out')).toBeVisible()
	await expect(page.getByTestId('user-menu-switch-school')).toHaveCount(0)

	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin'))
	await page.getByTestId('user-menu').click()
	await expect(page.getByTestId('user-menu-switch-school')).toBeVisible()
})

test('с экрана «не найдено» можно выйти', async ({ page, loginAs }) => {
	await loginAs('student')
	await page.goto(schoolUrl('demo', '/no-such-page'))
	await page.getByTestId('error-sign-out').click()
	await expect(page).toHaveURL(/\/login/)
	// без входа кнопки нет
	await page.goto(schoolUrl('demo', '/no-such-page'))
	await expect(page.getByRole('link', { name: /На главную/ })).toBeVisible()
	await expect(page.getByTestId('error-sign-out')).toHaveCount(0)
})
