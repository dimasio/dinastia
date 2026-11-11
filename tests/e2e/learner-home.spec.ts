// Кабинет ученика (карточка 4.5): «Продолжить обучение» ведёт на следующий урок, «Ближайшие сроки» и «На доработке» ведут в
// урок, карточка курса — «Пройдено X из Y уроков» и кнопка действия. Ученик — student4: «Продолжить» зависит от последнего
// открытого урока, а student1 параллельно открывает уроки в других сценариях.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Кабинет ${run}`
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

test('кабинет: продолжить, ближайший срок, работа на доработке', async ({ page, loginAs, browser }) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const course = await api(page, 'POST', '/courses', { title: COURSE })
	await api(page, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'open' })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Раздел' })
	const intro = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Введение' })
	const text = await api(page, 'POST', `/lessons/${intro.id}/blocks`, { type: 'text' })
	await api(page, 'PATCH', `/blocks/${text.id}`, { data: { body: doc('Введение') } })
	await api(page, 'POST', `/lessons/${intro.id}/publish`, {})
	const work = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Практика' })
	const block = await api(page, 'POST', `/lessons/${work.id}/blocks`, { type: 'assignment' })
	await api(page, 'PATCH', `/blocks/${block.id}`, { data: { ...block.data, prompt: doc('Опишите рабочее место') } })
	await api(page, 'POST', `/lessons/${work.id}/publish`, {})
	await api(page, 'PATCH', `/lessons/${work.id}/settings`, { deadlineDays: 3 })
	await api(page, 'POST', `/courses/${course.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student4@demo.local' })

	// ученик проходит введение и сдаёт практику; преподаватель возвращает на доработку
	const student = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await student.goto(schoolUrl('demo', '/login'))
	await student.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'student4@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await api(student, 'POST', `/learn/lessons/${intro.id}/open`, {})
	const sent = await api(student, 'POST', `/assignment/${work.id}/${block.blockKey}/submit`, {
		body: doc('Стол, стул, монитор'),
		fileIds: [],
	})
	await api(page, 'POST', `/assignment/submissions/${sent.submission.id}/review`, {
		decision: 'needs_revision',
		comment: doc('Добавьте освещение'),
	})

	await student.goto(schoolUrl('demo', '/learn'))
	const next = student.getByTestId('home-continue')
	await expect(next).toContainText(COURSE)
	await expect(next).toContainText('Следующий урок: Практика')
	await expect(student.getByTestId('home-deadline').filter({ hasText: COURSE })).toContainText(/Сдать до/)
	await expect(student.getByTestId('home-revision').filter({ hasText: COURSE })).toContainText('Практика')
	const card = student.getByTestId('my-course').filter({ hasText: COURSE })
	await expect(card.getByTestId('progress-label')).toHaveText('Пройдено 1 из 2 уроков')
	await expect(card.getByTestId('my-course-action')).toHaveText('Продолжить')
	await shoot(student, '4.5-learner-home')

	await student.getByTestId('home-continue-action').click()
	await expect(student.getByTestId('player-title')).toHaveText('Практика')
	await student.goto(schoolUrl('demo', '/learn'))
	await student.getByTestId('home-revision').filter({ hasText: COURSE }).click()
	await expect(student.getByTestId('player-title')).toHaveText('Практика')
	await student.close()
})
