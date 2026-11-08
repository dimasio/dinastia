// Демо фазы 3 (docs/tasks/phase-3-assessments/task.md): ученик проходит тест (автопроверка и развёрнутый ответ) и сдаёт
// домашнее задание; куратор оценивает развёрнутый ответ, возвращает задание на доработку; ученик пересдаёт; куратор принимает —
// урок завершён. Курс собирает преподаватель (через API страницы — конструктор и банк проверяют свои сценарии),
// ученик зачислен командой db:enroll (экранов зачисления до фазы 4 нет).
import { execFileSync } from 'node:child_process'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Финал ${run}`

test('демо фазы 3: тест и задание → проверка куратором → доработка → принято → урок пройден', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(240_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	const ids = await page.evaluate(async (title) => {
		const call = async (path: string, body: unknown, method = 'POST') => {
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
		const course = await call('/courses', { title })
		const section = await call(`/courses/${course.id}/sections`, { title: 'Итоги' })
		const lesson = await call(`/sections/${section.id}/lessons`, { title: 'Итоговая проверка' })
		const q1 = await call(`/courses/${course.id}/questions`, {
			type: 'single_choice',
			data: {
				prompt: text('Сколько будет 2 + 2?'),
				explanation: null,
				points: 1,
				options: [
					{ body: text('Три'), isCorrect: false },
					{ body: text('Четыре'), isCorrect: true },
				],
			},
			tags: [],
		})
		const q2 = await call(`/courses/${course.id}/questions`, {
			type: 'open_text',
			data: { prompt: text('Опишите, чему вы научились на курсе'), explanation: text('Образец ответа'), points: 4 },
			tags: [],
		})
		const quiz = await call(`/lessons/${lesson.id}/blocks`, { type: 'quiz' })
		await call(
			`/blocks/${quiz.id}`,
			{ data: { ...quiz.data, passScorePct: 60, questions: [{ questionId: q1.id }, { questionId: q2.id }] } },
			'PATCH',
		)
		const assignment = await call(`/lessons/${lesson.id}/blocks`, { type: 'assignment' })
		await call(
			`/blocks/${assignment.id}`,
			{ data: { ...assignment.data, prompt: text('Нарисуйте итоговую работу') } },
			'PATCH',
		)
		await call(`/lessons/${lesson.id}/publish`, {})
		await call(`/courses/${course.id}/publish`, {})
		return { courseId: course.id as string, lessonId: lesson.id as string }
	}, COURSE)
	execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/enroll.ts', 'demo', 'student1@demo.local', COURSE, 'open'],
		{
			stdio: 'pipe',
		},
	)

	await test.step('урок считается пройденным «по заданиям и тестам» — это видно в конструкторе', async () => {
		await page.goto(schoolUrl('demo', `/admin/courses/${ids.courseId}/lessons/${ids.lessonId}`))
		await expect(page.getByTestId('lesson-completion')).toHaveValue('all_blocks')
	})

	const login = async (email: string) => {
		const p = await browser.newPage()
		await p.goto(schoolUrl('demo', '/login'))
		await p.evaluate(async (e) => {
			const r = await fetch('/api/auth/sign-in/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: e, password: 'demo12345' }),
			})
			if (!r.ok) throw new Error(`вход: ${r.status}`)
		}, email)
		return p
	}
	const student = await login('student1@demo.local')
	const curator = await login('curator@demo.local')
	const lessonUrl = schoolUrl('demo', `/learn/courses/${ids.courseId}/lessons/${ids.lessonId}`)

	await test.step('ученик: тест — автопроверка и развёрнутый ответ; урок ещё не пройден', async () => {
		await student.goto(lessonUrl)
		await expect(student.getByTestId('quiz-panel')).toBeVisible()
		await expect(student.getByTestId('player-done')).toHaveCount(0)
		await student.getByTestId('quiz-start').click()
		await student.getByTestId('quiz-q-0-option-1').click() // «Четыре»
		await student.getByTestId('quiz-q-1-input').fill('Я научился смешивать краски и строить композицию')
		await student.getByTestId('quiz-submit').click()
		await expect(student.getByTestId('quiz-verdict')).toHaveAttribute('data-verdict', 'pending')
		await expect(student.getByTestId('quiz-score')).toHaveText('1 из 5 · 20%') // автопроверка: 1 балл из 5
		await shoot(student, 'phase-3-quiz-pending')
	})

	await test.step('ученик: домашнее задание отправлено; урок всё ещё не пройден', async () => {
		await student.getByTestId('quiz-close').click()
		await student.getByTestId('assignment-body').click()
		await student.keyboard.type('Итоговая работа — натюрморт')
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
		await expect(student.getByTestId('player-done')).toHaveCount(0)
	})

	await test.step('куратор: в очереди тест и задание; оценивает развёрнутый ответ — тест сдан', async () => {
		await curator.goto(schoolUrl('demo', '/admin/review'))
		await curator.getByTestId('resource-review-search').fill('Ученик Первый')
		const rows = curator.getByTestId('resource-review-row').filter({ hasText: COURSE })
		await expect(rows).toHaveCount(2)
		await expect(rows.filter({ hasText: 'Тест' })).toContainText('На проверке')
		await expect(rows.filter({ hasText: 'Задание' })).toContainText('На проверке')
		await shoot(curator, 'phase-3-queue')
		await rows.filter({ hasText: 'Тест' }).getByTestId('review-open').click()
		await expect(curator.getByTestId('attempt-review')).toBeVisible()
		await expect(curator.getByTestId('attempt-q-1-answer')).toContainText('смешивать краски')
		await curator.getByTestId('attempt-q-1-score').fill('3,5')
		await curator.getByTestId('attempt-q-1-feedback').click()
		await curator.keyboard.type('Хорошо, добавьте примеры')
		await curator.getByTestId('attempt-save').click()
		await expect(curator.getByTestId('attempt-verdict')).toHaveAttribute('data-verdict', 'passed') // 1 + 3,5 из 5 = 90 %
		await expect(curator.getByTestId('attempt-score')).toHaveText('4,5 / 5')
		await shoot(curator, 'phase-3-grading')
	})

	await test.step('куратор: задание — на доработку', async () => {
		await curator.goto(schoolUrl('demo', '/admin/review'))
		await curator.getByTestId('resource-review-search').fill('Ученик Первый')
		await curator
			.getByTestId('resource-review-row')
			.filter({ hasText: COURSE })
			.filter({ hasText: 'Задание' })
			.getByTestId('review-open')
			.click()
		await expect(curator.getByTestId('review-screen')).toBeVisible()
		await curator.getByTestId('review-composer-body').click()
		await curator.keyboard.type('Добавьте тени и перспективу')
		await curator.getByTestId('review-composer-needs-revision').click()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'needs_revision')
	})

	await test.step('ученик: видит оценку теста и комментарии, пересдаёт задание; урок ещё не пройден', async () => {
		await student.reload()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'needs_revision')
		await expect(student.getByTestId('assignment-comments-item')).toContainText('Добавьте тени')
		await student.getByTestId('quiz-open-result').click()
		await expect(student.getByTestId('quiz-verdict')).toHaveAttribute('data-verdict', 'passed')
		await expect(student.getByTestId('quiz-score')).toHaveText('4,5 из 5 · 90%')
		await expect(student.getByTestId('quiz-feedback')).toContainText('добавьте примеры')
		await student.getByTestId('quiz-close').click()
		await expect(student.getByTestId('player-done')).toHaveCount(0)
		await student.getByTestId('assignment-body').click()
		await student.keyboard.press('End')
		await student.keyboard.type(' — с тенями и перспективой')
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
	})

	await test.step('куратор принимает — урок завершён, прогресс курса 100 %', async () => {
		await curator.reload()
		await expect(curator.getByTestId('review-revision')).toHaveText('Отправка №2')
		await curator.getByTestId('review-composer-accept').click()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'accepted')

		await student.reload()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'accepted')
		await expect(student.getByTestId('player-done')).toBeVisible()
		await student.goto(schoolUrl('demo', '/learn'))
		await expect(student.getByTestId('my-course').filter({ hasText: COURSE }).getByTestId('progress-label')).toHaveText(
			'Пройдено 100%',
		)
		await shoot(student, 'phase-3-done')
	})
})
