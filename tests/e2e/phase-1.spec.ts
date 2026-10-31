// Демо фазы 1 (docs/plan/roadmap.md, «Низкий код: реестры и генераторы»): механизмы фазы на новой школе по шагам —
// ресурс из схемы контракта (1.2), письмо из очереди задач (1.6, 1.8), файл в S3 (1.7), форматированный текст (1.12),
// блок урока (1.3), тип вопроса (1.4). Вторая половина критерия — агент по скиллу делает новый ресурс и блок без правок
// ядра — проверяется независимым агентом (plan.md, «План 1.13», шаг 13.4) и пробой генераторов `pnpm gen:probe`.
import { expect, test } from '@playwright/test'
import { waitForLink } from './mailpit.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const slug = `e2e1-${run}`
const school = `http://${slug}.dinastia.localhost:5173`
// PNG 16×16 — настоящий файл для загрузки
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)

test('демо фазы 1', async ({ page }) => {
	await test.step('владелец регистрирует школу', async () => {
		await page.goto('/register')
		await page.getByLabel('Ваше имя').fill('Вера Владелец')
		await page.getByLabel('Email').fill(`owner1-${run}@e2e.local`)
		await page.getByLabel('Пароль').fill('e2e-password-1')
		await page.getByLabel('Название школы').fill('Школа фазы 1')
		await page.getByLabel('Адрес школы').fill(slug)
		await page.getByTestId('schools-register-submit').click()
		await expect(page).toHaveURL(`${school}/admin`)
	})

	await test.step('1.2 + 1.6 + 1.8: ресурс «Сотрудники» — приглашение формой из схемы, письмо уходит задачей', async () => {
		await page.goto(`${school}/admin/staff`)
		await expect(page.getByTestId('resource-staff-row')).toHaveCount(1) // пока только владелец
		const email = `curator1-${run}@e2e.local`
		await page.getByTestId('resource-staff-create').click()
		const form = page.getByTestId('resource-staff-create-form')
		await form.getByLabel('Email').fill(email)
		await form.getByTestId('resource-staff-create-form-role').click()
		await page.getByRole('option', { name: 'Куратор' }).click()
		await form.getByTestId('resource-staff-create-form-submit').click()
		await expect(page.getByText(`Приглашение отправлено на ${email}`)).toBeVisible()
		// письмо собрал шаблон defineEmail, отправила задача mail.send из очереди pg-boss
		expect(await waitForLink(email, /http:\/\/\S+\/invite\/\S+/)).toContain(`${slug}.dinastia.localhost`)
		await shoot(page, 'phase-1-staff')
	})

	await test.step('1.7: аватар — загрузка напрямую в S3 по подписанной ссылке', async () => {
		await page.goto(`${school}/admin/profile`)
		await page.getByTestId('profile-avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png })
		const img = page.getByTestId('profile-avatar').getByRole('img')
		await expect(img).toBeVisible()
		expect(await img.getAttribute('src')).toContain('X-Amz-Signature')
		await expect(page.getByTestId('user-menu').getByRole('img')).toBeVisible()
	})

	await test.step('1.12: форматированный текст — редактор профиля, вставка приводится к профилю', async () => {
		await page.goto('/dev/rich-text')
		await page.getByTestId('sandbox-title').fill('Описание')
		const editor = page.getByTestId('sandbox-description')
		await editor.click()
		await page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: 'Жирный' }).click()
		await page.keyboard.type('Главное')
		await page.getByTestId('sandbox-submit').click()
		await expect(page.getByTestId('sandbox-verdict')).toHaveText('Профиль принимает документ')
		await expect(page.getByTestId('sandbox-view').locator('strong')).toHaveText('Главное')
	})

	await test.step('1.3: блок урока из реестра — палитра, черновик, публикация, вид ученика', async () => {
		await page.goto('/dev/blocks')
		await page.getByTestId('block-palette-callout').click()
		await page.getByTestId('draft-0-tone').click()
		await page.getByRole('option', { name: 'Совет' }).click()
		await page.getByTestId('draft-0-body').click()
		await page.keyboard.type('Повторите урок перед тестом')
		await page.waitForTimeout(300) // хост отдаёт значение с задержкой
		await page.getByTestId('sandbox-publish').click()
		await expect(page.getByTestId('published-0')).toHaveAttribute('data-tone', 'success')
		await expect(page.getByTestId('published-0')).toContainText('Повторите урок перед тестом')
	})

	await test.step('1.4: тип вопроса из реестра — составить, пройти без верного ответа на экране, проверить', async () => {
		await page.goto('/dev/questions')
		await page.getByTestId('bank-prompt').click()
		await page.keyboard.type('Столица Франции?')
		await page.getByTestId('bank-option-0').click()
		await page.keyboard.type('Лион')
		await page.getByTestId('bank-option-1').click()
		await page.keyboard.type('Париж')
		await page.getByTestId('bank-correct-1').check()
		await page.waitForTimeout(300)
		await page.getByTestId('sandbox-start').click()
		await expect(page.getByTestId('attempt').locator('[data-correct]')).toHaveCount(0)
		await page.getByTestId('attempt-option-1').click()
		await page.getByTestId('sandbox-check').click()
		await expect(page.getByTestId('sandbox-verdict')).toHaveText('Верно')
		await shoot(page, 'phase-1-question')
	})
})
