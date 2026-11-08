// Тест в плеере (карточка 3.3, часть б): ученик начинает попытку, отвечает, сдаёт, видит результат и разбор; повторная
// попытка и лимит; таймер на экране. Курс и тест собирает преподаватель через API страницы (редактор блока и банк
// проверяют quiz-editor.spec и question-bank.spec); ученик зачислен командой db:enroll (экранов зачисления до фазы 4 нет).
import { execFileSync } from 'node:child_process'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Тест ${run}`

test('тест: пройти, сдать, разбор, повторная попытка и лимит', async ({ page, loginAs, browser }) => {
	test.setTimeout(150_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))

	// курс, урок с тестом из двух вопросов (2 балла, проходной 60 %, 2 попытки, время 5 мин), публикация — через API страницы
	await page.evaluate(async (title) => {
		const post = async (path: string, body: unknown, method = 'POST') => {
			const r = await fetch(`/api/v1${path}`, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`)
			return r.json()
		}
		const text = (t: string) => ({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
		})
		const course = await post('/courses', { title })
		const section = await post(`/courses/${course.id}/sections`, { title: 'Раздел' })
		const lesson = await post(`/sections/${section.id}/lessons`, { title: 'Проверка знаний' })
		const q1 = await post(`/courses/${course.id}/questions`, {
			type: 'single_choice',
			data: {
				prompt: text('Сколько будет 2 + 2?'),
				explanation: text('Два плюс два — четыре.'),
				points: 1,
				options: [
					{ body: text('Три'), isCorrect: false },
					{ body: text('Четыре'), isCorrect: true },
				],
			},
			tags: [],
		})
		const q2 = await post(`/courses/${course.id}/questions`, {
			type: 'number',
			data: {
				prompt: text('Чему равно π до сотых?'),
				explanation: null,
				points: 1,
				numberAnswer: 3.14,
				numberTolerance: 0.01,
			},
			tags: [],
		})
		const block = await post(`/lessons/${lesson.id}/blocks`, { type: 'quiz' })
		await post(
			`/blocks/${block.id}`,
			{
				data: {
					...block.data,
					attemptsLimit: 2,
					passScorePct: 60,
					timeLimitSec: 300,
					showCorrect: 'after_submit',
					questions: [{ questionId: q1.id }, { questionId: q2.id }],
				},
			},
			'PATCH',
		)
		await post(`/lessons/${lesson.id}/publish`, {})
		await post(`/courses/${course.id}/publish`, {})
	}, COURSE)
	execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/enroll.ts', 'demo', 'student1@demo.local', COURSE, 'open'],
		{ stdio: 'pipe' },
	)

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
	await student.goto(schoolUrl('demo', '/learn'))
	await student.getByTestId('my-course').filter({ hasText: COURSE }).click()
	await student.getByTestId('course-continue').click()

	const panel = student.getByTestId('quiz-panel')
	await expect(panel).toBeVisible()
	await expect(panel).toContainText('2 вопроса')
	await expect(panel).toContainText('Проходной балл — 60%')
	await expect(panel).toContainText('Время — 5 мин')
	await expect(student.getByTestId('quiz-attempts-used')).toHaveText('Попытки: 0 из 2')
	await shoot(student, 'quiz-panel')

	await test.step('попытка 1: верно на оба вопроса', async () => {
		await student.getByTestId('quiz-start').click()
		await expect(student.getByTestId('quiz-attempt-screen')).toBeVisible()
		await expect(student.getByTestId('quiz-timer')).toBeVisible()
		expect(Number(await student.getByTestId('quiz-timer').getAttribute('data-seconds'))).toBeLessThanOrEqual(300)
		await expect(student.getByTestId('quiz-answered')).toHaveText('Отвечено 0 из 2')
		await student.getByTestId('quiz-q-0-option-1').click() // «Четыре»
		await student.getByTestId('quiz-q-1-input').fill('3,14')
		await expect(student.getByTestId('quiz-answered')).toHaveText('Отвечено 2 из 2')
		await shoot(student, 'quiz-attempt')

		// обновление страницы не теряет ответы
		await student.waitForTimeout(700) // сохранение — через 0,4 с после правки
		await student.reload()
		await student.getByTestId('quiz-continue').click()
		await expect(student.getByTestId('quiz-answered')).toHaveText('Отвечено 2 из 2')

		await student.getByTestId('quiz-submit').click()
		await expect(student.getByTestId('quiz-verdict')).toHaveAttribute('data-verdict', 'passed')
		await expect(student.getByTestId('quiz-score')).toHaveText('2 из 2 · 100%')
		await expect(student.getByTestId('quiz-result-question')).toHaveCount(2)
		await expect(student.locator('[data-testid=quiz-result-question][data-correct=true]')).toHaveCount(2)
		await shoot(student, 'quiz-result')
	})

	await test.step('попытка 2: неверно; лимит исчерпан', async () => {
		await student.getByTestId('quiz-again').click()
		await expect(student.getByTestId('quiz-attempt-screen')).toBeVisible()
		await student.getByTestId('quiz-q-0-option-0').click() // «Три» — неверно
		// второй вопрос без ответа: сдача с подтверждением
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('quiz-submit').click()
		await expect(student.getByTestId('quiz-verdict')).toHaveAttribute('data-verdict', 'failed')
		await expect(student.getByTestId('quiz-score')).toHaveText('0 из 2 · 0%')
		await expect(student.locator('[data-testid=quiz-result-question][data-correct=false]')).toHaveCount(2)
		await expect(student.getByTestId('quiz-again')).toHaveCount(0) // попыток больше нет

		await student.getByTestId('quiz-close').click()
		await expect(student.getByTestId('quiz-exhausted')).toBeVisible()
		await expect(student.getByTestId('quiz-attempts-used')).toHaveText('Попытки: 2 из 2')
		await expect(student.getByTestId('quiz-best')).toContainText('2 из 2 (100%)')
		await expect(student.getByTestId('quiz-attempt')).toHaveCount(2)
	})
})
