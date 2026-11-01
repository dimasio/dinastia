// Курсы (карточка 2.1): экран-список — создание с описанием, изменение, архив, удаление пустого черновика, права;
// на телефоне строки — карточки.
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)

test('преподаватель создаёт курс с описанием, меняет адрес, отправляет в архив; пустой черновик удаляет', async ({
	page,
	loginAs,
}) => {
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin'))
	await page.getByRole('link', { name: 'Курсы' }).click()
	await expect(page).toHaveURL(/\/admin\/courses/)

	// создание: название, адрес не заполняем — возьмётся из названия; описание — форматированный текст
	const title = `Акварель ${run}`
	await page.getByTestId('resource-courses-create').click()
	const form = page.getByTestId('resource-courses-create-form')
	await form.getByLabel('Название').fill(title)
	const description = form.getByTestId('resource-courses-create-form-description')
	await description.click()
	await page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: 'Жирный' }).click()
	await page.keyboard.type('Для начинающих')
	await form.getByTestId('resource-courses-create-form-submit').click()
	await expect(page.getByText(`Курс «${title}» создан`)).toBeVisible()

	const row = page.getByTestId('resource-courses-row').filter({ hasText: title })
	await expect(row).toContainText('Черновик')

	// изменение адреса у черновика; поиск находит по адресу
	await row.getByTestId('resource-courses-row-actions').click()
	await page.getByTestId('resource-courses-action-edit').click()
	const edit = page.getByTestId('resource-courses-action-edit-form')
	await expect(edit.getByLabel('Адрес')).toHaveValue(`akvarel-${run}`)
	await edit.getByLabel('Адрес').fill(`watercolor-${run}`)
	await edit.getByTestId('resource-courses-action-edit-form-submit').click()
	await page.getByTestId('resource-courses-search').fill(`watercolor-${run}`)
	await expect(page.getByTestId('resource-courses-row')).toHaveCount(1)

	// архив с подтверждением; удалять архивный нельзя — пункта нет
	await row.getByTestId('resource-courses-row-actions').click()
	await page.getByTestId('resource-courses-action-archive').click()
	await page.getByTestId('resource-courses-confirm').click()
	await expect(row).toContainText('В архиве')
	await row.getByTestId('resource-courses-row-actions').click()
	await expect(page.getByTestId('resource-courses-action-remove')).toHaveCount(0)
	await page.keyboard.press('Escape')

	// пустой черновик — удаляется
	await page.getByTestId('resource-courses-search').fill('')
	const empty = `Пустой ${run}`
	await page.getByTestId('resource-courses-create').click()
	await page.getByTestId('resource-courses-create-form').getByLabel('Название').fill(empty)
	await page.getByTestId('resource-courses-create-form-submit').click()
	const emptyRow = page.getByTestId('resource-courses-row').filter({ hasText: empty })
	await emptyRow.getByTestId('resource-courses-row-actions').click()
	await page.getByTestId('resource-courses-action-remove').click()
	await page.getByTestId('resource-courses-confirm').click()
	await expect(page.getByText(`Курс «${empty}» удалён`)).toBeVisible()
	await expect(emptyRow).toHaveCount(0)
})

test('куратор видит курсы, но не создаёт и не правит', async ({ page, loginAs }) => {
	await loginAs('curator')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await expect(page.getByRole('heading', { name: 'Курсы' })).toBeVisible()
	await expect(page.getByTestId('resource-courses-create')).toHaveCount(0)
	await expect(page.getByTestId('resource-courses-row-actions')).toHaveCount(0)
})

test('@shots курсы и сотрудники: на телефоне строки — карточки', async ({ page, loginAs }) => {
	await loginAs('owner')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await expect(page.getByRole('heading', { name: 'Курсы' })).toBeVisible()
	await shoot(page, 'courses')
	await page.setViewportSize({ width: 375, height: 800 })
	await page.goto(schoolUrl('demo', '/admin/staff'))
	await expect(page.getByTestId('resource-staff-cards')).toBeVisible()
	await expect(page.getByTestId('resource-staff-table')).toHaveCount(0)
	await shoot(page, 'staff-cards', { mobile: false })
})
