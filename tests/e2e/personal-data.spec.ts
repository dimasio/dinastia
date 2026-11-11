// Персональные данные (карточка 5.5): реквизиты оператора ПДн в настройках школы, типовая политика школы, согласие при
// присоединении (флажок обязателен), документы Dinastia на корневом домене; ученик скачивает свои данные, администратор
// удаляет их — в списках школы остаётся «Удалённый ученик».
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'

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

test('ученик с согласием присоединяется и скачивает свои данные; администратор удаляет их', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(150_000)
	const COURSE = `Данные ${run}`
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const courseId = await page.evaluate(async (title) => {
		const call = async (path: string, body: unknown, method = 'POST') => {
			const r = await fetch(`/api/v1${path}`, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
			return r.json()
		}
		const course = await call('/courses', { title })
		const section = await call(`/courses/${course.id}/sections`, { title: 'Раздел' })
		const lesson = await call(`/sections/${section.id}/lessons`, { title: 'Урок' })
		const block = await call(`/lessons/${lesson.id}/blocks`, { type: 'text' })
		await call(
			`/blocks/${block.id}`,
			{ data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] } } },
			'PATCH',
		)
		await call(`/lessons/${lesson.id}/publish`, {})
		await call(`/courses/${course.id}/publish`, {})
		return course.id as string
	}, COURSE)
	await page.goto(schoolUrl('demo', `/admin/courses/${courseId}/learners`))
	await page.getByTestId('invites-open').click()
	await page.getByTestId('invite-create').click()
	const url = await page.getByTestId('invite-url').inputValue()

	// присоединение: без флажка согласия кнопка недоступна
	const email = `pd-${run}@e2e.local`
	const student = await (await browser.newContext({ locale: 'ru-RU', acceptDownloads: true })).newPage()
	await student.goto(url)
	await student.getByTestId('auth-signin-email').fill(email)
	await student.getByTestId('auth-signin-submit').click()
	await student.goto(await waitForLink(email, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
	await expect(student.getByTestId('pd-consent')).toContainText('Даю согласие')
	await expect(student.getByTestId('join-accept')).toBeDisabled()
	await student.screenshot(shots('5.5-join-consent'))
	await student.getByTestId('pd-consent-checkbox').check()
	await student.getByTestId('join-accept').click()
	await expect(student).toHaveURL(new RegExp(`/learn/courses/${courseId}$`))

	// ученик скачивает архив своих данных из профиля
	await student.goto(schoolUrl('demo', '/learn/profile'))
	await expect(student.getByTestId('my-data-delete')).toContainText('pd@demo.local')
	const download = student.waitForEvent('download')
	await student.getByTestId('my-data-download').click()
	const file = await download
	expect(file.suggestedFilename()).toMatch(/мои данные\.zip$/)
	await student.screenshot(shots('5.5-my-data'))

	// администратор удаляет данные ученика
	await loginAs('admin')
	await page.goto(schoolUrl('demo', `/admin/students?q=${encodeURIComponent(email)}`))
	const row = page.getByTestId('resource-students-row').filter({ hasText: email })
	await expect(row).toContainText('Учится')
	await row.getByTestId('resource-students-row-actions').click()
	await page.getByTestId('resource-students-action-anonymize').click()
	const form = page.getByTestId('resource-students-action-anonymize-form')
	await form.getByLabel('Введите «удалить»').fill('удалить')
	await page.screenshot(shots('5.5-anonymize'))
	await form.getByTestId('resource-students-action-anonymize-form-submit').click()
	await expect(page.getByText('Данные ученика удалены')).toBeVisible()

	await page.goto(schoolUrl('demo', `/admin/courses/${courseId}/learners`))
	await expect(page.getByTestId('resource-enrollments-row').first()).toContainText('Удалённый ученик')
	await expect(page.getByText(email)).toHaveCount(0)
})

test('владелец удаляет школу: школа закрыта, в «Моих школах» — дата и отмена', async ({ page }) => {
	const slug = `del-${run}`
	await page.goto('http://dinastia.localhost:5173/register')
	await page.getByLabel('Ваше имя').fill('Владелец Удаляемой')
	await page.getByLabel('Email').fill(`del-${run}@e2e.local`)
	await page.getByLabel('Пароль').fill('e2e-password-1')
	await page.getByLabel('Название школы').fill('Школа на удаление')
	await page.getByLabel('Адрес школы').fill(slug)
	await page.getByTestId('schools-register-submit').click()
	await expect(page).toHaveURL(`http://${slug}.dinastia.localhost:5173/admin`)

	await page.goto(schoolUrl(slug, '/admin/settings'))
	await page.getByTestId('delete-school-open').click()
	await expect(page.getByTestId('delete-school-submit')).toBeDisabled()
	await page.getByTestId('delete-school-slug').fill(slug)
	await page.screenshot(shots('5.5-delete-school'))
	await page.getByTestId('delete-school-submit').click()

	// корневой домен: дата удаления и отмена
	await expect(page).toHaveURL('http://dinastia.localhost:5173/')
	await expect(page.getByTestId(`schools-deleting-${slug}`)).toContainText('Удаляется')
	await page.screenshot(shots('5.5-my-schools-deleting'))

	// школа закрыта
	const closed = await page.context().newPage()
	await closed.goto(schoolUrl(slug, '/login'))
	await expect(closed.getByText('Школа закрыта и будет удалена')).toBeVisible()

	await page.getByTestId(`schools-cancel-deletion-${slug}`).click()
	await expect(page.getByTestId(`schools-open-${slug}`)).toBeVisible()
	await closed.reload()
	await expect(closed.getByTestId('login-title')).toContainText('Школа на удаление')
})
