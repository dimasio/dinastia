// Домашнее задание (карточка 3.4): ученик пишет ответ, прикладывает файл, сохраняет черновик и отправляет; преподаватель
// (через API — экрана проверки до 3.5 нет) возвращает на доработку; ученик видит комментарий, пересдаёт; работа принята.
import { execFileSync } from 'node:child_process'
import { expect, openNewLesson, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Задание ${run}`
// PNG 16×16 — настоящий файл для загрузки
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)

test('задание: черновик, отправка, доработка, повторная отправка, принято', async ({ page, loginAs, browser }) => {
	test.setTimeout(150_000)
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
		const section = await call(`/courses/${course.id}/sections`, { title: 'Раздел' })
		const lesson = await call(`/sections/${section.id}/lessons`, { title: 'Домашняя работа' })
		const block = await call(`/lessons/${lesson.id}/blocks`, { type: 'assignment' })
		await call(
			`/blocks/${block.id}`,
			{ data: { ...block.data, prompt: text('Нарисуйте натюрморт с фруктами'), maxFiles: 2 } },
			'PATCH',
		)
		await call(`/lessons/${lesson.id}/publish`, {})
		await call(`/courses/${course.id}/publish`, {})
		const blocks = await (await fetch(`/api/v1/lessons/${lesson.id}/blocks`)).json()
		return { lessonId: lesson.id as string, blockKey: blocks[0].blockKey as string }
	}, COURSE)
	execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/enroll.ts', 'demo', 'student1@demo.local', COURSE, 'open'],
		{
			stdio: 'pipe',
		},
	)
	const review = (submissionId: string, decision: string, comment: string | null) =>
		page.evaluate(
			async ([sid, d, c]) => {
				const body = c ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: c }] }] } : null
				const r = await fetch(`/api/v1/assignment/submissions/${sid}/review`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ decision: d, comment: body }),
				})
				if (!r.ok) throw new Error(`review: ${r.status} ${await r.text()}`)
			},
			[submissionId, decision, comment] as const,
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

	const panel = student.getByTestId('assignment-panel')
	const status = student.getByTestId('assignment-status')
	await expect(panel).toContainText('Нарисуйте натюрморт с фруктами')
	await expect(status).toHaveAttribute('data-status', 'draft')
	await expect(status).toHaveText('Не начато')

	await test.step('черновик: текст и файл', async () => {
		await student.getByTestId('assignment-body').click()
		await student.keyboard.type('Вот мой первый вариант')
		await student
			.getByTestId('assignment-file-input')
			.setInputFiles({ name: 'натюрморт.png', mimeType: 'image/png', buffer: png })
		await expect(student.getByTestId('assignment-file')).toContainText('натюрморт.png')
		await student.getByTestId('assignment-save').click()
		await expect(student.getByText('Черновик сохранён').first()).toBeVisible()
		await expect(status).toHaveText('Черновик')
		await shoot(student, 'assignment-draft')
		// неподходящий тип файла — ошибка до загрузки
		await student
			.getByTestId('assignment-file-input')
			.setInputFiles({ name: 'вирус.html', mimeType: 'text/html', buffer: Buffer.from('<b>x</b>') })
		await expect(student.getByTestId('assignment-error')).toHaveText('Такой тип файла здесь не подходит.')
	})

	await test.step('отправка: после неё править нельзя', async () => {
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(status).toHaveAttribute('data-status', 'submitted')
		await expect(student.getByTestId('assignment-readonly')).toContainText('ждёт проверки')
		await expect(student.getByTestId('assignment-readonly')).toContainText('Вот мой первый вариант')
		await expect(student.getByTestId('assignment-file-link')).toHaveText('натюрморт.png')
		await expect(student.getByTestId('assignment-submit')).toHaveCount(0)
		await shoot(student, 'assignment-submitted')
	})

	const submissionId = await student.evaluate(
		async ([l, b]) => {
			const r = await fetch(`/api/v1/assignment/${l}/${b}`)
			return (await r.json()).submission.id as string
		},
		[ids.lessonId, ids.blockKey] as const,
	)

	await test.step('на доработку: комментарий виден, можно пересдать', async () => {
		await review(submissionId, 'needs_revision', 'Добавьте тени и перспективу')
		await student.reload()
		await expect(status).toHaveAttribute('data-status', 'needs_revision')
		await expect(student.getByTestId('assignment-comment')).toContainText('Добавьте тени и перспективу')
		await expect(student.getByTestId('assignment-revision-hint')).toBeVisible()
		await student.getByTestId('assignment-body').click()
		await student.keyboard.press('End')
		await student.keyboard.type(' — с тенями')
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(status).toHaveAttribute('data-status', 'submitted')
		await expect(student.getByTestId('assignment-readonly')).toContainText('с тенями')
	})

	await test.step('принято: конечный статус', async () => {
		await review(submissionId, 'accept', null)
		await student.reload()
		await expect(status).toHaveAttribute('data-status', 'accepted')
		await expect(status).toHaveText('Принято')
		await expect(student.getByTestId('assignment-readonly')).toContainText('Работа принята')
		await expect(student.getByTestId('assignment-submit')).toHaveCount(0)
		await shoot(student, 'assignment-accepted')
	})
})

test('задание в конструкторе: замечания, настройки, предпросмотр', async ({ page, loginAs }) => {
	test.setTimeout(90_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Практика')
	await page.getByTestId('block-palette-assignment').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(1)
	const block = page.getByTestId('lesson-block').last()
	await expect(block.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: нет формулировки задания')

	await block
		.getByTestId(/-prompt$/)
		.first()
		.click()
	await page.keyboard.type('Запишите видео-разбор своей работы')
	await expect(block.getByTestId('lesson-block-issues')).toHaveCount(0)
	await block.getByTestId(/-allow-text$/).uncheck()
	await block.getByTestId(/-allow-files$/).uncheck()
	await expect(block.getByTestId('lesson-block-issues')).toHaveText(/не выбрано, что принимать/)
	await block.getByTestId(/-allow-files$/).check()
	await block.getByTestId(/-max-files$/).fill('4')
	await block.getByTestId(/-requires-review$/).uncheck()
	await page.waitForTimeout(800) // правка уходит на сервер через 0,5 с — индикатор до этого показывает прежнее «сохранено»
	await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 })

	await page.getByTestId('lesson-mode-preview').click()
	const preview = page.getByTestId('lesson-preview')
	await expect(preview).toContainText('Запишите видео-разбор своей работы')
	await expect(preview).toContainText('Файлы — до 4')
	await expect(preview).toContainText('Принимается сразу')
	await shoot(page, 'assignment-editor')
	await page.getByTestId('lesson-mode-editor').click()
	await page.getByTestId('lesson-publish').click()
	await expect(page.getByTestId('lesson-status')).toHaveAttribute('data-status', 'published')
})
