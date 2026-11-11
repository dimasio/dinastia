// Сертификаты (карточка 4.7): преподаватель включает сертификат курса и смотрит предпросмотр; ученик проходит курс и скачивает
// PDF и письмо «сертификат готов» (4.8); номер проверяется на публичной странице школы без входа (имя — сокращённо). Ученик —
// student5: свой курс, без гонок.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Сертификат ${run}`
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Вызов REST API из страницы (cookie сессии — у браузера). */
const api = (page: Page, method: string, path: string, body?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(`/api/v1${p}`, {
				method: m,
				headers: { 'content-type': 'application/json' },
				...(b === undefined ? {} : { body: JSON.stringify(b) }),
			})
			if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
			return r.json()
		},
		[method, path, body] as const,
	)

test('сертификат: шаблон и предпросмотр, PDF ученику, проверка по номеру', async ({ page, loginAs, browser }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const course = await api(page, 'POST', '/courses', { title: COURSE })
	await api(page, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'open' })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Инструктаж' })
	const lesson = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Вводный инструктаж' })
	const block = await api(page, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
	await api(page, 'PATCH', `/blocks/${block.id}`, { data: { body: doc('Вводный инструктаж') } })
	await api(page, 'POST', `/lessons/${lesson.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student5@demo.local' })

	// шаблон: включить, подписант, сохранить, предпросмотр
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}`))
	await page.getByTestId('course-tab-certificate').click()
	await page.getByTestId('certificate-enabled').check()
	await page.getByTestId('certificate-signer').fill('Анна Смирнова')
	await page.getByTestId('certificate-signer-title').fill('Директор учебного центра')
	await page.getByTestId('certificate-save').click()
	await expect(page.getByText('Шаблон сертификата сохранён')).toBeVisible()
	await page.getByTestId('certificate-preview').click()
	const frame = page.frameLocator('[data-testid="certificate-preview-frame"]')
	await expect(frame.getByText('Анна Смирнова')).toBeVisible()
	await expect(frame.getByText(`«${COURSE}»`)).toBeVisible()
	await shoot(page, '4.7-preview', { mobile: false })
	await page.keyboard.press('Escape')
	await shoot(page, '4.7-template')

	// ученик проходит курс и скачивает сертификат
	const student = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await student.goto(schoolUrl('demo', '/login'))
	await student.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'student5@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await api(student, 'POST', `/learn/lessons/${lesson.id}/open`, {})
	await student.goto(schoolUrl('demo', `/learn/courses/${course.id}`))
	const button = student.getByTestId('my-certificate')
	await expect(button).toBeVisible({ timeout: 30_000 })
	const download = student.waitForEvent('download')
	await button.click()
	const file = await download
	expect(file.suggestedFilename()).toMatch(/^Сертификат DEMO-\d{4}-\d{6}\.pdf$/)
	await shoot(student, '4.7-learner')
	await student.close()

	// список выданных у преподавателя
	await page.reload()
	const row = page.getByTestId('resource-issued-row').filter({ hasText: 'Ученик Пятый' })
	await expect(row).toContainText('Готов')
	const number = (await row.locator('td').first().innerText()).trim()
	expect(number).toMatch(/^DEMO-\d{4}-\d{6}$/)
	// письмо ученику: номер и ссылка на страницу курса
	const link = await waitForLink(
		'student5@demo.local',
		new RegExp(`${number}[\\s\\S]*?(http://\\S+/learn/courses/${course.id})`),
	)
	expect(link).toContain(`/learn/courses/${course.id}`)

	// проверка без входа: имя сокращено
	const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await guest.goto(schoolUrl('demo', '/certificates/verify'))
	await guest.getByTestId('verify-number').fill(number.toLowerCase())
	await guest.getByTestId('verify-submit').click()
	await expect(guest.getByTestId('verify-status')).toHaveText('Сертификат действителен')
	await expect(guest.getByTestId('verify-student')).toHaveText('Ученик П.')
	await shoot(guest, '4.7-verify')
	await guest.getByTestId('verify-number').fill('DEMO-1999-000000')
	await guest.getByTestId('verify-submit').click()
	await expect(guest.getByTestId('verify-error')).toContainText('не найден')
	await guest.close()
})
