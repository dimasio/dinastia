// Демо фазы 2 (docs/tasks/phase-2-courses/task.md): преподаватель собирает курс из 2 разделов и 5 уроков и публикует;
// ученик (зачисленный командой db:enroll — экранов зачисления до фазы 4 нет) проходит уроки последовательно.
import { execFileSync } from 'node:child_process'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const COURSE = `Демо ${run}`
const LESSONS = [
	['Раздел 1', ['Знакомство', 'Материалы', 'Первый мазок']],
	['Раздел 2', ['Смешивание', 'Итоговая работа']],
] as const

test('демо фазы 2: курс из 5 уроков собран и опубликован, ученик проходит последовательно', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(180_000) // пять уроков, публикация, зачисление и прохождение со снимками

	await test.step('преподаватель собирает курс: 2 раздела, 5 уроков', async () => {
		await loginAs('teacher')
		await page.goto(schoolUrl('demo', '/admin/courses'))
		await page.getByTestId('resource-courses-create').click()
		await page.getByTestId('resource-courses-create-form').getByLabel('Название').fill(COURSE)
		await page.getByTestId('resource-courses-create-form-submit').click()
		await page.getByRole('link', { name: COURSE }).click()
		for (const [section, lessons] of LESSONS) {
			await page.getByTestId('course-add-section').click()
			await page.getByTestId('course-new-section').fill(section)
			await page.getByTestId('course-new-section').press('Enter')
			const box = page.getByTestId('course-section').filter({ hasText: section })
			for (const lesson of lessons) {
				await box.getByTestId('course-add-lesson').click()
				await page.getByTestId('course-new-lesson').fill(lesson)
				await page.getByTestId('course-new-lesson').press('Enter')
				await expect(page.getByTestId('course-lesson-title').filter({ hasText: lesson })).toBeVisible()
			}
		}
		await expect(page.getByTestId('course-lesson')).toHaveCount(5)
	})

	await test.step('в каждом уроке — блок, затем публикация уроков и курса', async () => {
		for (const [, lessons] of LESSONS) {
			for (const lesson of lessons) {
				await page.getByTestId('course-lesson-title').filter({ hasText: lesson }).click()
				await page.getByTestId('block-palette-divider').click()
				await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved')
				await page.getByTestId('lesson-back').click()
				await expect(page.getByTestId('course-builder')).toBeVisible()
			}
		}
		await page.getByTestId('course-publish-changes').click()
		await expect(page.getByText('Опубликовано 5 уроков')).toBeVisible()
		await page.getByTestId('course-publish').click()
		await expect(page.getByTestId('course-status')).toHaveText('Опубликован')
	})

	// зачисление и режим «последовательно» — командой разработки (экраны зачисления и настройки курса — фаза 4)
	execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/enroll.ts', 'demo', 'student1@demo.local', COURSE, 'sequential'],
		{ stdio: 'pipe' },
	)

	const student = await browser.newPage()
	await test.step('ученик видит курс, уроки 2–5 закрыты с причиной', async () => {
		await student.context().clearCookies()
		await student.goto(schoolUrl('demo', '/login'))
		const status = await student.evaluate(
			async () =>
				(
					await fetch('/api/auth/sign-in/email', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ email: 'student1@demo.local', password: 'demo12345' }),
					})
				).status,
		)
		expect(status).toBe(200)
		await student.goto(schoolUrl('demo', '/learn'))
		const card = student.getByTestId('my-course').filter({ hasText: COURSE })
		await expect(card).toBeVisible()
		await expect(card.getByTestId('progress-label')).toHaveText('Пройдено 0 из 5 уроков')
		await card.click()
		const items = student.getByTestId('lesson-item')
		await expect(items).toHaveCount(5)
		await expect(items.first()).toHaveAttribute('data-status', 'available')
		await expect(student.locator('[data-testid=lesson-item][data-status=locked]')).toHaveCount(4)
		await expect(items.nth(1)).toContainText('Откроется после урока «Знакомство»')
		await shoot(student, 'phase-2-course')
	})

	await test.step('ученик проходит уроки по порядку', async () => {
		await student.getByTestId('course-continue').click()
		for (const [i, title] of ['Знакомство', 'Материалы', 'Первый мазок', 'Смешивание', 'Итоговая работа'].entries()) {
			await expect(student.getByTestId('player-title')).toHaveText(title)
			await expect(student.getByTestId('player-done')).toBeVisible() // правило «просмотр»: открыл — пройден
			if (i === 0) await shoot(student, 'phase-2-player')
			if (i < 4) await student.getByTestId('player-next').click()
		}
		// пройденный курс — на вкладке «Пройденные» (4.5)
		await student.goto(schoolUrl('demo', '/learn'))
		await student.getByTestId('my-tab-completed').click()
		await expect(student.getByTestId('my-course').filter({ hasText: COURSE }).getByTestId('progress-label')).toHaveText(
			'Пройдено 5 из 5 уроков',
		)
	})
})
