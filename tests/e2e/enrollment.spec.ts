// Зачисление (карточка 4.1): вкладка «Ученики» — зачислить по почте, создать аккаунт, продлить, отозвать и вернуть доступ;
// ученик видит отзыв доступа в «Моих курсах».
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'

const run = Date.now().toString(36)
const COURSE = `Зачисление ${run}`
const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

test('преподаватель зачисляет, продлевает, отзывает и возвращает доступ; администратор создаёт аккаунт', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(120_000)
	await loginAs('admin')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const courseId = await page.evaluate(async (title) => {
		const call = async (path: string, body: unknown) => {
			const r = await fetch(`/api/v1${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
			return r.json()
		}
		const course = await call('/courses', { title })
		const section = await call(`/courses/${course.id}/sections`, { title: 'Раздел' })
		const lesson = await call(`/sections/${section.id}/lessons`, { title: 'Урок' })
		const block = await (
			await fetch(`/api/v1/lessons/${lesson.id}/blocks`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'text' }),
			})
		).json()
		await fetch(`/api/v1/blocks/${block.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] } },
			}),
		})
		await call(`/lessons/${lesson.id}/publish`, {})
		await call(`/courses/${course.id}/publish`, {})
		return course.id as string
	}, COURSE)

	await page.goto(schoolUrl('demo', `/admin/courses/${courseId}`))
	await page.getByTestId('course-tab-learners').click()
	await expect(page).toHaveURL(/\/learners$/)
	await expect(page.getByText('На курсе пока нет учеников')).toBeVisible()

	// срок по умолчанию
	await page.getByTestId('default-days').fill('60')
	await page.getByTestId('default-days-save').click()
	await expect(page.getByText('Срок по умолчанию сохранён')).toBeVisible()

	// зачисление ученика школы
	await page.getByTestId('resource-enrollments-create').click()
	const form = page.getByTestId('resource-enrollments-create-form')
	await form.getByLabel('Email').fill('student1@demo.local')
	await page.screenshot(shots('4.1-enroll-form'))
	await form.getByTestId('resource-enrollments-create-form-submit').click()
	await expect(page.getByText('Готово: ученик зачислен или приглашён по почте')).toBeVisible()
	const rows = page.getByTestId('resource-enrollments-row')
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText('student1@demo.local')
	await expect(rows.first()).toContainText('Учится')
	expect(await waitForLink('student1@demo.local', new RegExp(`/learn/courses/${courseId}\\b`))).toContain(courseId)

	// администратор создаёт аккаунт новой почтой
	const email = `learner-${run}@e2e.local`
	await page.getByTestId('resource-enrollments-create').click()
	await form.getByLabel('Email').fill(email)
	await form.getByLabel('Имя').fill('Новый Ученик')
	await form.getByTestId('resource-enrollments-create-form-submit').click()
	await expect(rows).toHaveCount(2)
	await expect(rows.filter({ hasText: email })).toContainText('Новый Ученик')

	// продление
	const mine = rows.filter({ hasText: 'student1@demo.local' })
	await mine.getByTestId('resource-enrollments-row-actions').click()
	await page.getByTestId('resource-enrollments-action-extend').click()
	await page.getByTestId('resource-enrollments-action-extend-form-submit').click()
	await expect(page.getByText('доступ продлён')).toBeVisible()

	// отзыв — ученик видит «Доступ отозван»
	await mine.getByTestId('resource-enrollments-row-actions').click()
	await page.getByTestId('resource-enrollments-action-revoke').click()
	await page.screenshot(shots('4.1-revoke-confirm'))
	await page.getByTestId('resource-enrollments-confirm').click()
	await expect(mine).toContainText('Доступ отозван')

	const student = await browser.newPage()
	await student.goto(schoolUrl('demo', '/login'))
	await student.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'student1@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await student.goto(schoolUrl('demo', `/learn/courses/${courseId}`))
	await expect(student.getByText('Доступ к курсу отозван')).toBeVisible()
	await student.screenshot(shots('4.1-student-revoked'))

	// возврат
	await mine.getByTestId('resource-enrollments-row-actions').click()
	await page.getByTestId('resource-enrollments-action-restore').click()
	await page.getByTestId('resource-enrollments-confirm').click()
	await expect(mine).toContainText('Учится')
	await student.reload()
	await expect(student.getByText('Доступ к курсу отозван')).toHaveCount(0)
	await page.screenshot(shots('4.1-learners'))
	await student.close()
})

test('ссылка-приглашение и приглашение на почту: новый человек присоединяется к курсу по токену', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(120_000)
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
	}, `Приглашения ${run}`)

	// преподаватель создаёт ссылку: лимит 1 человек
	await page.goto(schoolUrl('demo', `/admin/courses/${courseId}/learners`))
	await page.getByTestId('invites-open').click()
	await page.getByTestId('invite-limit').fill('1')
	await page.getByTestId('invite-create').click()
	const url = await page.getByTestId('invite-url').inputValue()
	expect(url).toMatch(/\/join\//)
	await page.screenshot(shots('4.1-invites-sheet'))

	const join = async (link: string, email: string) => {
		const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
		await guest.goto(link)
		await expect(guest.getByTestId('join-card')).toContainText(`Приглашения ${run}`)
		await guest.getByTestId('auth-signin-email').fill(email)
		await guest.getByTestId('auth-signin-submit').click()
		await expect(guest.getByTestId('auth-link-sent')).toBeVisible()
		await guest.goto(await waitForLink(email, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
		return guest
	}
	const email = `join-${run}@e2e.local`
	const guest = await join(url, email)
	await guest.screenshot(shots('4.1-join-signed-in'))
	await guest.getByTestId('pd-consent-checkbox').check()
	await guest.getByTestId('join-accept').click()
	await expect(guest).toHaveURL(new RegExp(`/learn/courses/${courseId}$`))
	await expect(guest.getByText(`Приглашения ${run}`).first()).toBeVisible()

	// лимит исчерпан: второй человек получает отказ
	const late = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await late.goto(url)
	await expect(late.getByTestId('join-error')).toContainText('максимальное число раз')
	await late.screenshot(shots('4.1-join-exhausted'))

	// список учеников и панель ссылок
	await page.goto(schoolUrl('demo', `/admin/courses/${courseId}/learners`))
	await expect(page.getByTestId('resource-enrollments-row').filter({ hasText: email })).toContainText('Ссылка')
	await page.getByTestId('invites-open').click()
	await expect(page.getByTestId('invite-row').first()).toHaveAttribute('data-status', 'exhausted')

	// адресное приглашение: преподаватель шлёт на незнакомую почту
	const invited = `invited-${run}@e2e.local`
	await page
		.getByRole('button', { name: 'Close' })
		.click()
		.catch(() => page.keyboard.press('Escape'))
	await page.getByTestId('resource-enrollments-create').click()
	await page.getByTestId('resource-enrollments-create-form').getByLabel('Email').fill(invited)
	await page.getByTestId('resource-enrollments-create-form-submit').click()
	const link = await waitForLink(invited, /http:\/\/\S+\/join\/\S+/)
	const person = await join(link, invited)
	await person.getByTestId('pd-consent-checkbox').check()
	await person.getByTestId('join-accept').click()
	await expect(person).toHaveURL(new RegExp(`/learn/courses/${courseId}$`))
})

test('куратор видит учеников, но не зачисляет', async ({ page, loginAs }) => {
	await loginAs('teacher')
	const id = await page.evaluate(async (title) => {
		const r = await fetch('/api/v1/courses', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title }),
		})
		return (await r.json()).id as string
	}, `Куратор ${run}`)
	await loginAs('curator')
	await page.goto(schoolUrl('demo', `/admin/courses/${id}/learners`))
	await expect(page.getByText('На курсе пока нет учеников')).toBeVisible()
	await expect(page.getByTestId('resource-enrollments-create')).toHaveCount(0)
	await expect(page.getByTestId('default-days')).toHaveCount(0)
})
