// Экран «Сотрудники школы» — ресурс (пункт 1.2): список, поиск, фильтр, сортировка, приглашение, роль, блокировка.

import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'

const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

test('преподаватель видит сотрудников, но не управляет ими', async ({ page, loginAs }) => {
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin'))
	await page.getByRole('link', { name: 'Сотрудники' }).click()
	await expect(page).toHaveURL(/\/admin\/staff$/)
	const rows = page.getByTestId('resource-staff-row')
	await expect(rows).toHaveCount(4)
	await expect(page.getByTestId('resource-staff-create')).toHaveCount(0)
	await expect(page.getByTestId('resource-staff-row-actions')).toHaveCount(0)

	// поиск — без учёта регистра, состояние — в адресе
	await page.getByTestId('resource-staff-search').fill('CURATOR@')
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText('curator@demo.local')
	await expect(page).toHaveURL(/q=CURATOR/)
	await page.reload()
	await expect(rows).toHaveCount(1)

	// ничего не нашлось → сброс
	await page.getByTestId('resource-staff-search').fill('нет-такого')
	await expect(page.getByText('Ничего не нашлось')).toBeVisible()
	await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
	await expect(rows).toHaveCount(4)

	// фильтр по роли
	await page.getByTestId('resource-staff-filter-role').click()
	await page.getByRole('option', { name: 'Куратор' }).click()
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText('Куратор')
	await page.screenshot(shots('1.2-staff-filter'))
})

test('сортировка по имени в обе стороны', async ({ page, loginAs }) => {
	await loginAs('admin')
	await page.goto(schoolUrl('demo', '/admin/staff'))
	const names = page.getByTestId('resource-staff-row').locator('td:first-child')
	await expect(names).toHaveCount(4)
	await page.getByTestId('resource-staff-sort-name').click()
	const asc = await names.allTextContents()
	expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, 'ru')))
	await page.getByTestId('resource-staff-sort-name').click()
	await expect(page).toHaveURL(/dir=desc/)
	await expect.poll(() => names.allTextContents()).toEqual([...asc].reverse())
})

test('владелец приглашает, меняет роль, блокирует и возвращает доступ', async ({ page, loginAs }) => {
	await loginAs('owner')
	await page.goto(schoolUrl('demo', '/admin/staff'))

	// приглашение — форма из схемы контракта StaffInvite
	const email = `staff-${Date.now().toString(36)}@e2e.local`
	await page.getByTestId('resource-staff-create').click()
	const form = page.getByTestId('resource-staff-create-form')
	await form.getByLabel('Email').fill('не-email')
	await form.getByTestId('resource-staff-create-form-submit').click()
	await expect(form.getByRole('alert')).toHaveText('Проверьте заполнение полей.')
	await form.getByLabel('Email').fill(email)
	await form.getByTestId('resource-staff-create-form-role').click()
	await page.getByRole('option', { name: 'Куратор' }).click()
	await page.screenshot(shots('1.2-staff-invite'))
	await form.getByTestId('resource-staff-create-form-submit').click()
	await expect(page.getByText(`Приглашение отправлено на ${email}`)).toBeVisible()
	await expect(form).toHaveCount(0)
	expect(await waitForLink(email, /\/invite\/\S+/)).toBeTruthy()

	// у себя (владельца) действий нет
	const ownerRow = page.getByTestId('resource-staff-row').filter({ hasText: 'owner@demo.local' })
	await expect(ownerRow.getByTestId('resource-staff-row-actions')).toHaveCount(0)

	// смена роли куратора и обратно
	const curator = page.getByTestId('resource-staff-row').filter({ hasText: 'curator@demo.local' })
	const changeRole = async (from: string, to: string) => {
		await curator.getByTestId('resource-staff-row-actions').click()
		await page.getByTestId('resource-staff-action-changeRole').click()
		const roleForm = page.getByTestId('resource-staff-action-changeRole-form')
		await expect(roleForm.getByTestId('resource-staff-action-changeRole-form-role')).toHaveText(from)
		await roleForm.getByTestId('resource-staff-action-changeRole-form-role').click()
		await page.getByRole('option', { name: to }).click()
		await roleForm.getByTestId('resource-staff-action-changeRole-form-submit').click()
		await expect(curator).toContainText(to)
	}
	await changeRole('Куратор', 'Преподаватель')
	await changeRole('Преподаватель', 'Куратор')

	// блокировка с подтверждением и возврат доступа
	await curator.getByTestId('resource-staff-row-actions').click()
	await page.getByTestId('resource-staff-action-block').click()
	await expect(page.getByRole('alertdialog')).toContainText('Заблокировать')
	await page.screenshot(shots('1.2-staff-block-confirm'))
	await page.getByTestId('resource-staff-confirm').click()
	await expect(curator).toContainText('Заблокирован')
	await curator.getByTestId('resource-staff-row-actions').click()
	await page.getByTestId('resource-staff-action-unblock').click()
	await page.getByTestId('resource-staff-confirm').click()
	await expect(curator).toContainText('Активен')
})

test('мобильная ширина: список без горизонтальной прокрутки страницы', async ({ page, loginAs }) => {
	await page.setViewportSize({ width: 360, height: 740 })
	await loginAs('admin')
	await page.goto(schoolUrl('demo', '/admin/staff'))
	await expect(page.getByTestId('resource-staff-row')).toHaveCount(4)
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
	expect(overflow).toBeLessThanOrEqual(0)
	await page.screenshot(shots('1.2-staff-mobile'))
})
