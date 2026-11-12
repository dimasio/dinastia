// Доступ к урокам и пересдача (карточка 4.3): преподаватель ставит урок «по расписанию» в конструкторе урока и режим курса в
// конструкторе курса; ученик видит «Откроется …»; отклонённую работу преподаватель разрешает пересдать.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Доступ ${run}`
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

test('урок по расписанию, режим курса, пересдача отклонённой работы', async ({ page, loginAs, browser }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const course = await api(page, 'POST', '/courses', { title: COURSE })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Раздел' })
	const lessons: { id: string }[] = []
	for (const title of ['Введение', 'Через день']) {
		const lesson = await api(page, 'POST', `/sections/${section.id}/lessons`, { title })
		const block = await api(page, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
		await api(page, 'PATCH', `/blocks/${block.id}`, { data: { body: doc(title) } })
		await api(page, 'POST', `/lessons/${lesson.id}/publish`, {})
		lessons.push(lesson)
	}
	const task = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Задание' })
	const block = await api(page, 'POST', `/lessons/${task.id}/blocks`, { type: 'assignment' })
	await api(page, 'PATCH', `/blocks/${block.id}`, { data: { ...block.data, prompt: doc('Опишите огнетушитель') } })
	await api(page, 'POST', `/lessons/${task.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student1@demo.local' })
	const blockKey = ((await api(page, 'GET', `/lessons/${task.id}/blocks`)) as { blockKey: string }[])[0]?.blockKey

	// конструктор урока: «Когда урок открывается» → по расписанию, через 1 день
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}/lessons/${lessons[1]?.id}`))
	await page.getByTestId('lesson-access-mode').selectOption('drip')
	await expect(page.getByTestId('lesson-drip-days')).toHaveValue('1')
	await shoot(page, '4.3-lesson-access', { mobile: false })

	// конструктор курса: режим курса
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}`))
	await page.getByTestId('course-access-mode').selectOption('sequential')
	await expect(page.getByText('Доступ к темам сохранён')).toBeVisible()
	await page.getByTestId('course-access-mode').selectOption('open')

	// ученик: урок «Через день» закрыт до даты; сдаёт задание
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
	await expect(student.getByText('Откроется', { exact: false }).first()).toBeVisible()
	await shoot(student, '4.3-student-locked', { mobile: false })
	const submitted = await api(student, 'POST', `/assignment/${task.id}/${blockKey}/submit`, {
		body: doc('ОП-4 у кабинета'),
		fileIds: [],
	})
	const submissionId = submitted.submission.id as string

	// преподаватель отклоняет, затем разрешает пересдачу
	await api(page, 'POST', `/assignment/submissions/${submissionId}/review`, {
		decision: 'reject',
		comment: doc('Не тот этаж'),
	})
	await page.goto(schoolUrl('demo', `/admin/review/${submissionId}`))
	await expect(page.getByTestId('review-status')).toHaveAttribute('data-status', 'rejected')
	await page.getByTestId('review-composer-body').click()
	await page.keyboard.type('Проверьте огнетушитель на своём этаже и пришлите снова')
	await page.getByTestId('review-composer-allow-resubmit').click()
	await expect(page.getByTestId('review-status')).toHaveAttribute('data-status', 'needs_revision')
	await shoot(page, '4.3-review-resubmit', { mobile: false })
	await student.close()
})
