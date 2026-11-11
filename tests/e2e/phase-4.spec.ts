// Демо фазы 4 (docs/tasks/phase-4-learners/task.md): полный цикл от приглашения ученика до сертификата. Преподаватель собирает
// курс со сроком сдачи и сертификатом, заводит поток с куратором и приглашает незнакомую почту; новый ученик присоединяется по
// письму и входит по ссылке, проходит урок и сдаёт задание; куратор своего потока принимает работу; ученик получает письмо
// «сертификат готов» и скачивает PDF; школа видит прохождение в аналитике, номер проверяется без входа.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Охрана труда ${run}`
const STUDENT = `novichok-${run}@e2e.local`
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

const login = async (page: Page, email: string) => {
	await page.goto(schoolUrl('demo', '/login'))
	await page.evaluate(async (e) => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: e, password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	}, email)
}

test('демо фазы 4: приглашение → поток с куратором → прохождение и проверка → сертификат', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(240_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))

	const ids = await test.step('преподаватель: курс со сроком сдачи и сертификатом, поток с куратором', async () => {
		const course = await api(page, 'POST', '/courses', { title: COURSE })
		await api(page, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'sequential' })
		const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Инструктаж' })
		const intro = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Вводный инструктаж' })
		const text = await api(page, 'POST', `/lessons/${intro.id}/blocks`, { type: 'text' })
		await api(page, 'PATCH', `/blocks/${text.id}`, { data: { body: doc('Правила безопасности на рабочем месте') } })
		await api(page, 'POST', `/lessons/${intro.id}/publish`, {})
		const practice = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Практика' })
		const work = await api(page, 'POST', `/lessons/${practice.id}/blocks`, { type: 'assignment' })
		await api(page, 'PATCH', `/blocks/${work.id}`, {
			data: { ...work.data, prompt: doc('Опишите опасные факторы на вашем рабочем месте') },
		})
		await api(page, 'PATCH', `/lessons/${practice.id}/settings`, { deadlineDays: 7 })
		await api(page, 'POST', `/lessons/${practice.id}/publish`, {})
		await api(page, 'POST', `/courses/${course.id}/publish`, {})
		const template = await api(page, 'GET', `/courses/${course.id}/certificate-template`)
		const { courseId: _, signatureUrl: _s, backgroundUrl: _b, ...fields } = template
		await api(page, 'PUT', `/courses/${course.id}/certificate-template`, {
			...fields,
			enabled: true,
			signerName: 'Анна Смирнова',
			signerTitle: 'Директор',
		})
		const curators = await api(page, 'GET', '/groups/curator-options')
		const curator = curators.find((c: { email: string }) => c.email === 'curator@demo.local')
		const group = await api(page, 'POST', `/courses/${course.id}/groups`, {
			title: `Ноябрь ${run}`,
			curatorIds: [curator.memberId],
		})
		return { courseId: course.id as string, groupId: group.id as string, practiceId: practice.id as string }
	})

	await test.step('преподаватель приглашает незнакомую почту в поток', async () => {
		await page.goto(schoolUrl('demo', `/admin/courses/${ids.courseId}/learners`))
		const r = await api(page, 'POST', `/courses/${ids.courseId}/enrollments`, { email: STUDENT, groupId: ids.groupId })
		expect(r.outcome).toBe('invited')
	})

	const student = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await test.step('новый ученик: письмо-приглашение → вход по ссылке из письма → присоединился к курсу', async () => {
		await student.goto(await waitForLink(STUDENT, /http:\/\/\S+\/join\/\S+/))
		await expect(student.getByTestId('join-card')).toContainText(COURSE)
		await student.getByTestId('auth-signin-email').fill(STUDENT)
		await student.getByTestId('auth-signin-submit').click()
		await expect(student.getByTestId('auth-link-sent')).toBeVisible()
		await student.goto(await waitForLink(STUDENT, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
		await student.getByTestId('join-accept').click()
		await expect(student).toHaveURL(new RegExp(`/learn/courses/${ids.courseId}$`))
		await shoot(student, 'phase-4-joined')
	})

	await test.step('ученик: кабинет — продолжить и срок сдачи; урок пройден, задание отправлено', async () => {
		await student.goto(schoolUrl('demo', '/learn'))
		await expect(student.getByTestId('home-continue')).toContainText(COURSE)
		await student.getByTestId('home-continue-action').click()
		await expect(student.getByText('Правила безопасности на рабочем месте')).toBeVisible()
		// первый урок пройден — «Практика» открылась, её срок — в «Ближайших сроках»
		await student.goto(schoolUrl('demo', '/learn'))
		await expect(student.getByTestId('home-deadline').filter({ hasText: 'Практика' })).toBeVisible()
		await shoot(student, 'phase-4-home')
		await student.goto(schoolUrl('demo', `/learn/courses/${ids.courseId}/lessons/${ids.practiceId}`))
		await student.getByTestId('assignment-body').click()
		await student.keyboard.type('Шум, пыль, работа на высоте')
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
	})

	await test.step('куратор потока принимает работу — курс пройден', async () => {
		const curator = await browser.newPage()
		await login(curator, 'curator@demo.local')
		await curator.goto(schoolUrl('demo', '/admin/review'))
		await curator.getByTestId('resource-review-row').filter({ hasText: COURSE }).getByTestId('review-open').click()
		await expect(curator.getByTestId('review-screen')).toBeVisible()
		await curator.getByTestId('review-composer-accept').click()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'accepted')
		await curator.close()
	})

	await test.step('ученик: письмо «сертификат готов», скачивает PDF', async () => {
		const link = await waitForLink(STUDENT, new RegExp(`http://\\S+/learn/courses/${ids.courseId}(?=\\s|$)`), 60_000)
		await student.goto(link)
		const button = student.getByTestId('my-certificate')
		await expect(button).toBeVisible({ timeout: 30_000 })
		const download = student.waitForEvent('download')
		await button.click()
		expect((await download).suggestedFilename()).toMatch(/^Сертификат DEMO-\d{4}-\d{6}\.pdf$/)
		await shoot(student, 'phase-4-certificate')
	})

	const number = await test.step('школа: аналитика — курс пройден; выданный сертификат', async () => {
		await page.goto(schoolUrl('demo', `/admin/courses/${ids.courseId}/analytics`))
		await expect(page.getByTestId('analytics-learners')).toHaveText('1')
		await expect(page.getByTestId('analytics-lesson').nth(1)).toContainText('прошли 1 (100%)')
		await shoot(page, 'phase-4-analytics')
		await page.getByTestId('course-tab-certificate').click()
		const row = page.getByTestId('resource-issued-row').first()
		await expect(row).toContainText('Готов')
		return (await row.locator('td').first().innerText()).trim()
	})

	await test.step('проверка сертификата по номеру без входа', async () => {
		const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
		await guest.goto(schoolUrl('demo', `/certificates/verify?number=${number}`))
		await expect(guest.getByTestId('verify-status')).toHaveText('Сертификат действителен')
		await expect(guest.getByTestId('verify-result')).toContainText(COURSE)
		await guest.close()
	})
	await student.close()
})
