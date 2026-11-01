// Публикация (карточка 2.5): незаполненный блок не даёт опубликовать урок → заполнить → опубликовать → правка → «Есть
// изменения»; курс без опубликованных уроков не публикуется; «Опубликовать изменения» и «Опубликовать курс».
import { expect, openDemoCourse, openNewLesson, test } from './fixtures.ts'
import { shoot } from './shots.ts'

test('урок и курс: статусы, незаполненные блоки, публикация', async ({ page, loginAs }) => {
	test.setTimeout(90_000) // два экрана, несколько публикаций и снимки
	await loginAs('teacher')
	await openNewLesson(page, 'Вступление')
	const status = page.getByTestId('lesson-status')
	await expect(status).toHaveAttribute('data-status', 'draft')

	// пустое видео: пометка на карточке, публикация отклонена
	await page.getByTestId('block-palette-video').click()
	const video = page.getByTestId('lesson-block').last()
	await expect(video.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: нет ссылки на видео')
	await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved')
	await page.getByTestId('lesson-publish').click()
	await expect(page.getByText('В уроке есть незаполненные блоки')).toBeVisible()
	await expect(status).toHaveAttribute('data-status', 'draft')
	await shoot(page, 'publishing-lesson-issues')

	const saved = page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())
	await video.getByLabel('Ссылка на видео').fill('https://youtu.be/dQw4w9WgXcQ')
	await saved
	await expect(video.getByTestId('lesson-block-issues')).toHaveCount(0)
	await page.getByTestId('lesson-publish').click()
	await expect(status).toHaveAttribute('data-status', 'published')
	await expect(page.getByTestId('lesson-publish')).toBeDisabled()

	// правка после публикации — «Есть изменения»
	await page.getByTestId('block-palette-divider').click()
	await expect(status).toHaveAttribute('data-status', 'changed')
	await shoot(page, 'publishing-lesson-changed')

	// конструктор курса: изменённый урок помечен; второй урок — черновик
	await page.getByTestId('lesson-back').click()
	await expect(page.getByTestId('course-builder')).toBeVisible()
	await expect(page.getByTestId('course-lesson-status')).toHaveAttribute('data-status', 'changed')
	await page.getByTestId('course-add-lesson').click()
	await page.getByTestId('course-new-lesson').fill('Пустой урок')
	await page.getByTestId('course-new-lesson').press('Enter')
	await expect(page.getByTestId('course-publish-changes')).toHaveText('Опубликовать изменения (2)')

	// во втором уроке нет блоков — изменения не публикуются, ничего не меняется
	await page.getByTestId('course-publish-changes').click()
	await expect(page.getByText('В уроке нет блоков')).toBeVisible()
	await expect(page.getByTestId('course-publish-changes')).toHaveText('Опубликовать изменения (2)')

	// удалить пустой урок — и опубликовать изменения, затем курс
	await page
		.getByTestId('course-lesson')
		.filter({ hasText: 'Пустой урок' })
		.getByRole('button', { name: 'Действия' })
		.click()
	await page.getByRole('menuitem', { name: 'Удалить урок' }).click()
	await page.getByTestId('course-confirm').click()
	await page.getByTestId('course-publish-changes').click()
	await expect(page.getByText('Опубликован 1 урок')).toBeVisible()
	await expect(page.getByTestId('course-publish-changes')).toHaveCount(0)
	await expect(page.getByTestId('course-lesson-status')).toHaveCount(0)

	await page.getByTestId('course-publish').click()
	await expect(page.getByTestId('course-status')).toHaveText('Опубликован')
	await expect(page.getByTestId('course-publish')).toHaveCount(0)
	await shoot(page, 'publishing-course')
})

test('куратор видит статусы, но не публикует', async ({ page, loginAs }) => {
	await loginAs('curator')
	await openDemoCourse(page)
	await expect(page.getByTestId('course-status')).toBeVisible()
	await expect(page.getByTestId('course-publish')).toHaveCount(0)
	await expect(page.getByTestId('course-publish-changes')).toHaveCount(0)
})
