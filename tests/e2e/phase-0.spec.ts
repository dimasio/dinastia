// Демо фазы 0 (docs/plan/roadmap.md): регистрация школы → приглашение преподавателя → вход по magic link → кабинет.
import { expect, test } from '@playwright/test'
import { waitForLink } from './mailpit.ts'

const run = Date.now().toString(36)
const owner = { name: 'Ольга Основатель', email: `owner-${run}@e2e.local`, password: 'e2e-password-1' }
const teacherEmail = `teacher-${run}@e2e.local`
const slug = `e2e-${run}`
const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

test('демо фазы 0', async ({ page, browser }) => {
	// 1. Владелец регистрирует школу на корневом домене
	await page.goto('/register')
	await page.screenshot(shots('01-register'))
	await page.getByLabel('Ваше имя').fill(owner.name)
	await page.getByLabel('Email').fill(owner.email)
	await page.getByLabel('Пароль').fill(owner.password)
	await page.getByLabel('Название школы').fill('Школа рисования')
	await page.getByLabel('Адрес школы').fill(slug)
	await page.getByTestId('schools-register-submit').click()

	// …и попадает в кабинет своей школы на её поддомене
	await expect(page).toHaveURL(`http://${slug}.dinastia.localhost:5173/admin`)
	await expect(page.getByTestId('admin-school-name')).toHaveText('Школа рисования')
	await expect(page.getByRole('heading', { name: 'Добро пожаловать, Ольга' })).toBeVisible()
	await page.screenshot(shots('02-admin-owner'))

	// 2. Приглашает преподавателя (UI списка сотрудников — фаза 1.2; пока — тем же API, что и UI)
	// запрос из страницы: Node не резолвит *.localhost на macOS, браузер — да
	const status = await page.evaluate(async (email) => {
		const r = await fetch('/api/v1/school/invitations', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, role: 'teacher' }),
		})
		return r.status
	}, teacherEmail)
	expect(status).toBe(201)

	// 3. Преподаватель открывает письмо-приглашение в чистом браузере
	const teacher = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	const inviteUrl = await waitForLink(teacherEmail, /http:\/\/\S+\/invite\/\S+/)
	await teacher.goto(inviteUrl)
	await expect(teacher.getByTestId('invite-card')).toContainText('Приглашение в школу «Школа рисования»')
	await expect(teacher.getByTestId('invite-card')).toContainText('Роль — Преподаватель')
	await teacher.screenshot(shots('03-invite-guest'))

	// …входит по ссылке из письма (magic link)
	await teacher.getByTestId('auth-signin-submit').click()
	await expect(teacher.getByTestId('auth-link-sent')).toBeVisible()
	const magic = await waitForLink(teacherEmail, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/)
	await teacher.goto(magic)

	// …возвращается на приглашение уже вошедшим и принимает его
	await expect(teacher.getByTestId('invite-accept')).toBeVisible()
	await teacher.screenshot(shots('04-invite-signed-in'))
	await teacher.getByTestId('pd-consent-checkbox').check()
	await teacher.getByTestId('invite-accept').click()

	// 4. Видит пустой кабинет школы
	await expect(teacher).toHaveURL(`http://${slug}.dinastia.localhost:5173/admin`)
	await expect(teacher.getByRole('heading', { name: /Добро пожаловать/ })).toBeVisible()
	await teacher.screenshot(shots('05-admin-teacher'))
})

test('ученик попадает в /learn, гость школы — на вход', async ({ page }) => {
	await page.goto('http://demo.dinastia.localhost:5173/')
	await expect(page).toHaveURL(/\/login$/)
	await expect(page.getByTestId('login-title')).toHaveText('Вход в школу «Демо-школа»')
	await page.screenshot(shots('06-login'))
	await page.getByTestId('auth-signin-email').fill('student1@demo.local')
	await page.getByTestId('auth-signin-password').fill('demo12345')
	await page.getByTestId('auth-signin-submit').click()
	await expect(page).toHaveURL('http://demo.dinastia.localhost:5173/learn')
	await expect(page.getByRole('heading', { name: 'Мои курсы' })).toBeVisible()
	await page.screenshot(shots('07-learn'))

	// ученику нельзя в кабинет школы — уводит в /learn
	await page.goto('http://demo.dinastia.localhost:5173/admin')
	await expect(page).toHaveURL('http://demo.dinastia.localhost:5173/learn')
})

test('неверный пароль — понятная ошибка; мобильная ширина', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 })
	await page.goto('http://demo.dinastia.localhost:5173/login')
	await page.getByTestId('auth-signin-email').fill('teacher@demo.local')
	await page.getByTestId('auth-signin-password').fill('wrong-password')
	await page.getByTestId('auth-signin-submit').click()
	await expect(page.getByTestId('auth-signin-error')).toHaveText('Неверный email или пароль.')
	await page.screenshot(shots('08-login-error-mobile'))
})
