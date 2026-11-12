// Аналитика курса (карточка 4.6): преподаватель открывает вкладку «Аналитика» — сводка и воронка по урокам; на «Учениках» —
// пройдено уроков и «Выгрузить в Excel» (скачивается xlsx).
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Аналитика ${run}`
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

test('аналитика курса: сводка, воронка, выгрузка учеников в Excel', async ({ page, loginAs, browser }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const course = await api(page, 'POST', '/courses', { title: COURSE })
	await api(page, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'open' })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Инструктаж' })
	const lessons: { id: string }[] = []
	for (const title of ['Вводный инструктаж', 'Первичный инструктаж', 'Стажировка']) {
		const lesson = await api(page, 'POST', `/sections/${section.id}/lessons`, { title })
		const block = await api(page, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
		await api(page, 'PATCH', `/blocks/${block.id}`, { data: { body: doc(title) } })
		await api(page, 'POST', `/lessons/${lesson.id}/publish`, {})
		lessons.push(lesson)
	}
	await api(page, 'PATCH', `/lessons/${lessons[2]?.id}/settings`, { deadlineDate: '2020-01-10' })
	await api(page, 'POST', `/courses/${course.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student1@demo.local' })

	// ученик проходит первый урок
	const student = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await student.goto(schoolUrl('demo', '/login'))
	await student.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'student1@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await api(student, 'POST', `/learn/lessons/${lessons[0]?.id}/open`, {})
	await student.close()

	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}`))
	await page.getByTestId('course-tab-analytics').click()
	await expect(page.getByTestId('analytics-learners')).toHaveText('1')
	await expect(page.getByTestId('analytics-withOverdue')).toHaveText('1')
	const funnel = page.getByTestId('analytics-lesson')
	await expect(funnel).toHaveCount(3)
	await expect(funnel.nth(0)).toContainText('Вводный инструктаж')
	await expect(funnel.nth(0)).toContainText('прошли 1 (100%)')
	await expect(funnel.nth(2)).toContainText('1 с просрочкой')
	await shoot(page, '4.6-analytics')

	await page.getByTestId('course-tab-learners').click()
	const row = page.getByTestId('resource-enrollments-row').filter({ hasText: 'student1@demo.local' })
	await expect(row).toContainText('1 / 3')
	const download = page.waitForEvent('download')
	await page.getByTestId('resource-enrollments-page-export').click()
	const file = await download
	expect(file.suggestedFilename()).toBe(`${COURSE} — слушатели.xlsx`)
	await shoot(page, '4.6-learners', { mobile: false })
})
