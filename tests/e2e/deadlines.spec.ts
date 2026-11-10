// Дедлайны (карточка 4.4): преподаватель задаёт срок сдачи в конструкторе урока (дата и «через N дней»); ученик видит
// «Сдать до …» и «Срок прошёл …» в оглавлении и в уроке, просроченный урок открыт.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
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

test('срок сдачи: дата в прошлом — «Срок прошёл», через N дней — «Сдать до»', async ({ page, loginAs, browser }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const course = await api(page, 'POST', '/courses', { title: `Сроки ${run}` })
	await api(page, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'open' })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Раздел' })
	const lessons: { id: string }[] = []
	for (const title of ['Просроченный', 'На неделю']) {
		const lesson = await api(page, 'POST', `/sections/${section.id}/lessons`, { title })
		const block = await api(page, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
		await api(page, 'PATCH', `/blocks/${block.id}`, { data: { body: doc(title) } })
		await api(page, 'POST', `/lessons/${lesson.id}/publish`, {})
		lessons.push(lesson)
	}
	await api(page, 'POST', `/courses/${course.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student1@demo.local' })

	// конструктор урока: срок — до даты в прошлом
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}/lessons/${lessons[0]?.id}`))
	await page.getByTestId('lesson-deadline-kind').selectOption('date')
	await page.getByTestId('lesson-deadline-date').fill('2020-01-10')
	await page.getByTestId('lesson-deadline-date').blur()
	await expect.poll(async () => (await api(page, 'GET', `/lessons/${lessons[0]?.id}`)).deadlineDate).toBe('2020-01-10')
	// второй урок: через 7 дней
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}/lessons/${lessons[1]?.id}`))
	await page.getByTestId('lesson-deadline-kind').selectOption('days')
	await expect(page.getByTestId('lesson-deadline-days')).toHaveValue('7')
	await expect.poll(async () => (await api(page, 'GET', `/lessons/${lessons[1]?.id}`)).deadlineDays).toBe(7)
	await shoot(page, '4.4-lesson-deadline', { mobile: false })

	// ученик
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
	await student.goto(schoolUrl('demo', `/learn/courses/${course.id}`))
	const due = student.getByTestId('lesson-due')
	await expect(due.nth(0)).toHaveText(/Срок прошёл 10 января/)
	await expect(due.nth(1)).toHaveText(/Сдать до/)
	await shoot(student, '4.4-student-deadlines')
	await student.getByTestId('lesson-item').first().click()
	await expect(student.getByTestId('player-due')).toHaveText(/Срок прошёл/)
	await student.close()
})
