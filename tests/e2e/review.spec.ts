// Очередь проверки и переписка (карточка 3.5): куратор открывает очередь и работу, пишет комментарий с файлом, возвращает
// на доработку; ученик видит комментарий, отвечает и пересдаёт; куратор принимает; ученику уходят письма.
import { execFileSync } from 'node:child_process'
import { expect, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Проверка ${run}`
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)

test('проверка: очередь, работа, комментарий с файлом, доработка, ответ ученика, принято, письма', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(180_000)
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
		const lesson = await call(`/sections/${section.id}/lessons`, { title: 'Работа на проверку' })
		const block = await call(`/lessons/${lesson.id}/blocks`, { type: 'assignment' })
		await call(`/blocks/${block.id}`, { data: { ...block.data, prompt: text('Опишите ваш первый рисунок') } }, 'PATCH')
		await call(`/lessons/${lesson.id}/publish`, {})
		await call(`/courses/${course.id}/publish`, {})
		const blocks = await (await fetch(`/api/v1/lessons/${lesson.id}/blocks`)).json()
		return { courseId: course.id as string, lessonId: lesson.id as string, blockKey: blocks[0].blockKey as string }
	}, COURSE)
	execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/enroll.ts', 'demo', 'student1@demo.local', COURSE, 'open'],
		{
			stdio: 'pipe',
		},
	)

	// ученик отправляет работу
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
	const lessonUrl = schoolUrl('demo', `/learn/courses/${ids.courseId}/lessons/${ids.lessonId}`)
	await student.goto(lessonUrl)
	await student.getByTestId('assignment-body').click()
	await student.keyboard.type('Это натюрморт с яблоками')
	student.once('dialog', (d) => d.accept())
	await student.getByTestId('assignment-submit').click()
	await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')

	// куратор: очередь → работа
	const curator = await browser.newPage()
	await curator.goto(schoolUrl('demo', '/login'))
	await curator.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'curator@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await curator.goto(schoolUrl('demo', '/admin'))
	await curator.getByRole('link', { name: 'Проверка' }).click()
	await expect(curator).toHaveURL(/\/admin\/review/)
	await curator.getByTestId('resource-review-search').fill('Ученик Первый')
	const row = curator.getByTestId('resource-review-row').filter({ hasText: COURSE })
	await expect(row).toContainText('Работа на проверку')
	await expect(row).toContainText('На проверке')
	await shoot(curator, 'review-queue')
	await row.getByTestId('review-open').click()
	await expect(curator.getByTestId('review-screen')).toBeVisible()
	await expect(curator.getByTestId('review-student')).toHaveText('Ученик Первый')
	await expect(curator.getByTestId('review-answer')).toContainText('Это натюрморт с яблоками')
	await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'submitted')

	await test.step('«на доработку» без комментария нельзя; с комментарием и файлом — можно', async () => {
		await curator.getByTestId('review-composer-needs-revision').click()
		await expect(curator.getByTestId('review-composer-error')).toHaveText(
			'Напишите комментарий: ученик должен понять, что доработать.',
		)
		await curator.getByTestId('review-composer-body').click()
		await curator.keyboard.type('Добавьте тени, образец приложен')
		await curator
			.getByTestId('review-composer-file-input')
			.setInputFiles({ name: 'образец.png', mimeType: 'image/png', buffer: png })
		await expect(curator.getByTestId('review-composer-file')).toContainText('образец.png')
		await curator.getByTestId('review-composer-needs-revision').click()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'needs_revision')
		await expect(curator.getByTestId('review-comments-item')).toHaveCount(1)
		await expect(curator.getByTestId('review-comments-file')).toHaveText('образец.png')
		await shoot(curator, 'review-screen')
	})

	await test.step('письмо ученику; ученик видит комментарий, отвечает и пересдаёт', async () => {
		expect(await waitForLink('student1@demo.local', new RegExp(`http://\\S+/lessons/${ids.lessonId}`))).toContain(
			ids.lessonId,
		)
		await student.reload()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'needs_revision')
		await expect(student.getByTestId('assignment-comments-item')).toContainText('Добавьте тени')
		await expect(student.getByTestId('assignment-comments-file')).toHaveText('образец.png')
		await student.getByTestId('assignment-reply-body').click()
		await student.keyboard.type('Поняла, добавлю')
		await student.getByTestId('assignment-reply-send').click()
		await expect(student.getByTestId('assignment-comments-item')).toHaveCount(2)
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'needs_revision') // реплика статус не меняет

		await student.getByTestId('assignment-body').click()
		await student.keyboard.press('End')
		await student.keyboard.type(' — с тенями')
		student.once('dialog', (d) => d.accept())
		await student.getByTestId('assignment-submit').click()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'submitted')
	})

	await test.step('куратор видит ответ ученика и принимает', async () => {
		await curator.reload()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'submitted')
		await expect(curator.getByTestId('review-revision')).toHaveText('Отправка №2')
		await expect(curator.getByTestId('review-comments-item')).toHaveCount(2)
		await expect(curator.getByTestId('review-comments-item').nth(1)).toHaveAttribute('data-role', 'student')
		await expect(curator.getByTestId('review-answer')).toContainText('с тенями')
		await curator.getByTestId('review-composer-accept').click()
		await expect(curator.getByTestId('review-status')).toHaveAttribute('data-status', 'accepted')
		await expect(curator.getByTestId('review-final')).toBeVisible()
		await expect(curator.getByTestId('review-composer-accept')).toHaveCount(0)
		await student.reload()
		await expect(student.getByTestId('assignment-status')).toHaveAttribute('data-status', 'accepted')
		await expect(student.getByTestId('assignment-reply-send')).toHaveCount(0) // в конечном статусе отвечать нельзя
	})
})
