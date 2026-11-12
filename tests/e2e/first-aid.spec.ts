// Учебный центр АИР «Горизонт» (seed/airgorizont.ts): курс «Оказание первой помощи…» целиком глазами слушателя и куратора
// — все 31 тема по порядку, 7 тестов (все типы вопросов, ответы — по ключу из seed/first-aid.ts), проверка развёрнутого
// ответа, практическое задание с доработкой, итоговый тест, удостоверение и его проверка по номеру. Письма проверяются в
// Mailpit e2e на каждом шаге. Второй сценарий — письма сотрудникам и новым слушателям: приглашение, зачисление, вход по
// ссылке, напоминание о сроке.
import { execFileSync } from 'node:child_process'
import type { Browser, Page } from '@playwright/test'
import { AIRGORIZONT, PEOPLE } from '../../apps/api/src/seed/airgorizont.ts'
import { ASSIGNMENT_ANSWERS, COURSE, QUESTIONS, type Question, SECTIONS } from '../../apps/api/src/seed/first-aid.ts'
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink, waitForMail } from './mailpit.ts'
import { shoot } from './shots.ts'

const SLUG = AIRGORIZONT.slug
const SCHOOL = AIRGORIZONT.name
const url = (path: string) => schoolUrl(SLUG, path)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exactly = (s: string) => new RegExp(`^\\s*${escapeRe(s)}\\s*$`)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Новая вкладка с входом паролем (вход через API из страницы — как loginAs). */
async function signedIn(browser: Browser, email: string) {
	const page = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await page.goto(url('/login'))
	const status = await page.evaluate(
		async ([e, p]) =>
			(
				await fetch('/api/auth/sign-in/email', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: e, password: p }),
				})
			).status,
		[email, AIRGORIZONT.password] as const,
	)
	expect(status, `вход ${email}`).toBe(200)
	return page
}

/** Вызов REST API из страницы (cookie сессии — у браузера). */
const api = (page: Page, method: string, path: string, body?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(`/api/v1${p}`, {
				method: m,
				headers: { 'content-type': 'application/json' },
				...(b === undefined ? {} : { body: JSON.stringify(b) }),
			})
			if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${await r.text()}`)
			return r.json()
		},
		[method, path, body] as const,
	)

/** Вопрос попытки по тексту на экране: самый длинный текст вопроса из банка, который в нём есть. */
function questionOf(text: string): Question {
	const found = QUESTIONS.filter((q) => text.includes(q.prompt)).sort((a, b) => b.prompt.length - a.prompt.length)[0]
	if (!found) throw new Error(`вопрос не из банка курса: ${text.slice(0, 120)}`)
	return found
}

/** Ответить на i-й вопрос попытки верно — каждым типом вопроса через его элементы управления. */
async function answer(page: Page, i: number) {
	const id = `quiz-q-${i}`
	const box = page.getByTestId(id)
	const q = questionOf((await box.textContent()) ?? '')
	const option = (text: string) =>
		page.getByTestId(new RegExp(`^${id}-option-\\d+$`)).filter({ hasText: exactly(text) })
	switch (q.type) {
		case 'single_choice':
			await option(q.options[q.correct] as string).click()
			return
		case 'multiple_choice':
			for (const n of q.correct) await option(q.options[n] as string).click()
			return
		case 'text_input':
			await page.getByTestId(`${id}-input`).fill(q.accepted[0] as string)
			return
		case 'number':
			await page.getByTestId(`${id}-input`).fill(String(q.answer))
			return
		case 'open_text':
			await page.getByTestId(`${id}-input`).fill(q.model)
			return
		case 'matching':
			for (let k = 0; k < q.pairs.length; k++) {
				const row = (await page.getByTestId(`${id}-row-${k}`).textContent()) ?? ''
				const pair = q.pairs.find(([left]) => row.startsWith(left))
				if (!pair) throw new Error(`нет пары для «${row}»`)
				await page.getByTestId(`${id}-select-${k}`).selectOption({ label: pair[1] })
			}
			return
		case 'ordering':
			// «пузырьком» кнопками «выше»: на позицию t поднимается нужный шаг
			for (let t = 0; t < q.steps.length; t++) {
				for (;;) {
					const shown = await page.getByTestId(new RegExp(`^${id}-step-\\d+$`)).allTextContents()
					const at = shown.findIndex((s) => s.includes(q.steps[t] as string))
					if (at < 0) throw new Error(`нет шага «${q.steps[t]}»`)
					if (at === t) break
					await page.getByTestId(`${id}-up-${at}`).click()
				}
			}
			return
	}
}

/** Пройти тест темы: начать, ответить верно на все вопросы, сдать; вернуть вердикт. */
async function takeQuiz(page: Page) {
	await page.getByTestId('quiz-start').click()
	await expect(page.getByTestId('quiz-attempt-screen')).toBeVisible()
	const total = Number((await page.getByTestId('quiz-answered').textContent())?.match(/из (\d+)/)?.[1])
	expect(total).toBeGreaterThan(0)
	for (let i = 0; i < total; i++) await answer(page, i)
	await expect(page.getByTestId('quiz-answered')).toHaveText(`Отвечено ${total} из ${total}`)
	await page.waitForTimeout(700) // ответы сохраняются через 0,4 с после правки
	await page.getByTestId('quiz-submit').click()
	const verdict = page.getByTestId('quiz-verdict')
	await expect(verdict).toBeVisible()
	return { verdict: await verdict.getAttribute('data-verdict'), total }
}

async function submitAssignment(page: Page, text: string) {
	await page.getByTestId('assignment-body').click()
	await page.keyboard.type(text)
	page.once('dialog', (d) => d.accept())
	await page.getByTestId('assignment-submit').click()
	await expect(page.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
}

/** Открыть из очереди проверки куратора работу слушателя по типу («Тест» / «Задание»). */
async function openReview(curator: Page, kind: 'Тест' | 'Задание') {
	await curator.goto(url('/admin/review'))
	await curator.getByTestId('resource-review-search').fill('Тихомирова')
	const row = curator.getByTestId('resource-review-row').filter({ hasText: kind }).filter({ hasText: 'На проверке' })
	await expect(row).toHaveCount(1)
	// список перерисовывается по ответу поиска — клик до него теряется; повторяем, пока не откроется экран проверки
	const screen = curator.getByTestId(kind === 'Тест' ? 'attempt-review' : 'review-screen')
	await expect(async () => {
		if (!(await screen.isVisible())) await row.getByTestId('review-open').click({ timeout: 2_000 })
		await expect(screen).toBeVisible({ timeout: 2_000 })
	}).toPass({ timeout: 20_000 })
}

test('курс по первой помощи целиком: 31 тема, тесты, проверка куратором, удостоверение и письма', async ({
	browser,
}) => {
	test.setTimeout(300_000)
	const student = await signedIn(browser, PEOPLE.student.email)
	const curator = await signedIn(browser, PEOPLE.curator.email)
	const to = PEOPLE.student.email

	await test.step('слушатель: курс в «Моих курсах», 31 тема, ничего не пройдено', async () => {
		await student.goto(url('/learn'))
		const card = student.getByTestId('my-course').filter({ hasText: COURSE.title })
		await expect(card.getByTestId('progress-label')).toHaveText('Пройдено 0 из 31 темы')
		await card.click()
		await shoot(student, 'first-aid-course')
		await student.getByTestId('course-continue').click()
	})

	const topics = SECTIONS.flatMap((s) => s.topics)
	for (const [n, topic] of topics.entries()) {
		await test.step(`тема ${n + 1}: ${topic.title}`, async () => {
			await expect(student.getByTestId('player-title')).toHaveText(topic.title)
			const quiz = topic.blocks.some((b) => b.type === 'quiz')
			const assignment = topic.blocks.some((b) => b.type === 'assignment')

			if (quiz) {
				const { verdict, total } = await takeQuiz(student)
				if (topic.title === 'Итоговый тест') expect(total).toBe(20)
				if (verdict === 'pending') {
					// развёрнутый ответ: оценивает куратор группы, слушателю — письмо
					await expect(student.getByTestId('player-done')).toHaveCount(0)
					await openReview(curator, 'Тест')
					await expect(curator.getByTestId('attempt-review')).toBeVisible()
					const score = curator.getByTestId(/^attempt-q-\d+-score$/)
					await expect(score).toHaveCount(1)
					const qi = ((await score.getAttribute('data-testid')) ?? '').match(/\d+/)?.[0]
					await score.fill('3')
					await curator.getByTestId(`attempt-q-${qi}-feedback`).click()
					await curator.keyboard.type(
						'Верно: инородное тело не извлекают, давящая повязка с фиксацией, жгут при неэффективности.',
					)
					await curator.getByTestId('attempt-save').click()
					await expect(curator.getByTestId('attempt-verdict')).toHaveAttribute('data-verdict', 'passed')
					const mail = await waitForMail(to, new RegExp(`тест «${escapeRe(topic.title)}» проверен`))
					expect(mail.subject).toBe(`${SCHOOL}: тест «${topic.title}» проверен`)
					await student.reload()
					await student.getByTestId('quiz-open-result').click()
					await expect(student.getByTestId('quiz-verdict')).toHaveAttribute('data-verdict', 'passed')
					await expect(student.getByTestId('quiz-feedback')).toContainText('инородное тело не извлекают')
				} else {
					expect(verdict, topic.title).toBe('passed')
				}
				await student.getByTestId('quiz-close').click()
			}

			if (assignment) {
				const first = topic.deadlineDays === 14
				const text = first ? ASSIGNMENT_ANSWERS.bleeding : ASSIGNMENT_ANSWERS.fall
				await submitAssignment(student, first ? text.split('\n').slice(0, 3).join('\n') : text)
				await expect(student.getByTestId('player-done')).toHaveCount(0)
				await openReview(curator, 'Задание')
				await expect(curator.getByTestId('review-screen')).toBeVisible()
				if (first) {
					// первая сдача неполная — на доработку с комментарием, слушателю письмо; пересдача — принято
					await curator.getByTestId('review-composer-body').click()
					await curator.keyboard.type(
						'Не хватает: положение и контроль до приезда бригады, что сообщить диспетчеру, две ошибки.',
					)
					await curator.getByTestId('review-composer-needs-revision').click()
					await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'needs_revision')
					const back = await waitForMail(to, /нужно доработать/)
					expect(back.subject).toBe(`${SCHOOL}: работу по теме «${topic.title}» нужно доработать`)
					expect(back.text).toContain('положение и контроль')
					await student.reload()
					await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'needs_revision')
					await expect(student.getByTestId('assignment-comments-item')).toContainText('Не хватает')
					await student.getByTestId('assignment-body').click()
					await student.keyboard.press('ControlOrMeta+End')
					await student.keyboard.type(`\n${text.split('\n').slice(3).join('\n')}`)
					student.once('dialog', (d) => d.accept())
					await student.getByTestId('assignment-submit').click()
					await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
					await curator.reload()
					await expect(curator.getByTestId('review-revision')).toHaveText('Отправка №2')
				}
				await curator.getByTestId('review-composer-accept').click()
				await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'accepted')
				const ok = await waitForMail(to, new RegExp(`работа по теме «${escapeRe(topic.title)}» принята`))
				expect(ok.text).toContain(url(''))
				await student.reload()
				await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'accepted')
			}

			await expect(student.getByTestId('player-done')).toBeVisible()
			if (n < topics.length - 1) await student.getByTestId('player-next').click()
		})
	}

	await test.step('курс пройден: удостоверение — письмо, PDF, проверка по номеру', async () => {
		const mail = await waitForMail(to, /удостоверение по курсу/, 60_000)
		expect(mail.subject).toBe(`${SCHOOL}: удостоверение по курсу «${COURSE.title}» готово`)
		const number = mail.text.match(/AIRGORIZONT-\d{4}-\d{6}/)?.[0]
		expect(number, 'номер удостоверения в письме').toBeTruthy()

		// курс у слушателя один — вкладок «Текущие / Пройденные» нет, карточка сразу на странице
		await student.goto(url('/learn'))
		const card = student.getByTestId('my-course').filter({ hasText: COURSE.title })
		await expect(card.getByTestId('progress-label')).toHaveText('Пройдено 31 из 31 темы')
		await card.click()
		const button = student.getByTestId('my-certificate')
		await expect(button).toBeVisible({ timeout: 30_000 })
		const download = student.waitForEvent('download')
		await button.click()
		expect((await download).suggestedFilename()).toBe(`Удостоверение ${number}.pdf`)
		await shoot(student, 'first-aid-done')

		const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
		await guest.goto(url('/certificates/verify'))
		await guest.getByTestId('verify-number').fill(number as string)
		await guest.getByTestId('verify-submit').click()
		await expect(guest.getByTestId('verify-status')).toHaveText('Удостоверение действительно')
		await expect(guest.getByTestId('verify-student')).toHaveText('Тихомирова А. И.')
		await guest.close()
	})

	await test.step('куратор: в аналитике группы слушатель прошёл курс', async () => {
		await curator.goto(url('/admin/courses'))
		await curator.getByRole('link', { name: COURSE.title }).click()
		await curator.getByTestId('course-tab-learners').click()
		const row = curator.getByTestId('resource-enrollments-row').filter({ hasText: PEOPLE.student.name })
		await expect(row).toContainText('100')
		await expect(row).toContainText(AIRGORIZONT.group)
	})
})

test('письма центра: приглашение сотрудника, зачисление нового слушателя, вход по ссылке, срок прошёл', async ({
	browser,
}) => {
	test.setTimeout(180_000)
	const run = Date.now().toString(36)

	await test.step('владелец приглашает куратора — письмо со ссылкой на приглашение', async () => {
		const owner = await signedIn(browser, PEOPLE.owner.email)
		await owner.goto(url('/admin/staff'))
		const email = `kurator-${run}@airgorizont.local`
		await api(owner, 'POST', '/school/invitations', { email, role: 'curator' })
		const mail = await waitForMail(email, /Приглашение в учебный центр/)
		expect(mail.subject).toBe(`Приглашение в учебный центр «${SCHOOL}»`)
		const link = mail.text.match(/http:\/\/\S+\/invite\/\S+/)?.[0] as string
		expect(link).toContain(`${SLUG}.dinastia.localhost`)
		const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
		await guest.goto(link)
		await expect(guest.getByText(SCHOOL).first()).toBeVisible()
		await guest.close()
		await owner.close()
	})

	const admin = await signedIn(browser, PEOPLE.admin.email)
	await admin.goto(url('/admin/courses'))
	const email = `slushatel-${run}@airgorizont.local`

	await test.step('администратор зачисляет новую почту — письмо «вас записали», вход по ссылке из письма', async () => {
		const courses = (await api(admin, 'GET', `/courses?search=${encodeURIComponent('первой помощи')}`)) as {
			items: { id: string; title: string }[]
		}
		const course = courses.items.find((c) => c.title === COURSE.title)
		expect(course).toBeTruthy()
		const res = await api(admin, 'POST', `/courses/${course?.id}/enrollments`, { email, name: `Слушатель ${run}` })
		expect(res.outcome).toBe('enrolled')
		const mail = await waitForMail(email, /вас записали на курс/)
		expect(mail.subject).toBe(`${SCHOOL}: вас записали на курс «${COURSE.title}»`)

		const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
		await guest.goto(url('/login'))
		await guest.getByRole('button', { name: 'Войти по ссылке из письма' }).click()
		await guest.getByTestId('auth-signin-email').fill(email)
		await guest.getByTestId('auth-signin-submit').click()
		await expect(guest.getByTestId('auth-link-sent')).toBeVisible()
		const magic = await waitForMail(email, /Вход в/)
		expect(magic.subject).toBe(`Вход в «${SCHOOL}»`)
		await guest.goto(await waitForLink(email, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
		await guest.goto(url('/learn'))
		await expect(guest.getByTestId('my-course').filter({ hasText: COURSE.title })).toBeVisible()
		await guest.close()
	})

	await test.step('срок по теме прошёл — напоминание из ежедневной задачи', async () => {
		const course = await api(admin, 'POST', '/courses', { title: `Вводный инструктаж ${run}` })
		await api(admin, 'PATCH', `/courses/${course.id}`, { defaultAccessMode: 'open' })
		const section = await api(admin, 'POST', `/courses/${course.id}/sections`, { title: 'Инструктаж' })
		const lesson = await api(admin, 'POST', `/sections/${section.id}/lessons`, { title: `Отчёт об инструктаже ${run}` })
		const work = await api(admin, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'assignment' })
		await api(admin, 'PATCH', `/blocks/${work.id}`, { data: { ...work.data, prompt: doc('Подтвердите прохождение') } })
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
		await api(admin, 'PATCH', `/lessons/${lesson.id}/settings`, { deadlineDate: yesterday })
		await api(admin, 'POST', `/lessons/${lesson.id}/publish`, {})
		await api(admin, 'POST', `/courses/${course.id}/publish`, {})
		await api(admin, 'POST', `/courses/${course.id}/enrollments`, { email })

		execFileSync('pnpm', ['--filter', '@dinastia/api', 'jobs:run', 'learning.deadline-reminders'], { stdio: 'pipe' })
		const mail = await waitForMail(email, /прошёл/)
		expect(mail.subject).toBe(`${SCHOOL}: срок по теме «Отчёт об инструктаже ${run}» прошёл`)
	})
	await admin.close()
})
