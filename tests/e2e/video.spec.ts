// Загрузка видео (карточка 2.4b) на фейковом провайдере: режим «Загрузить файл» → «Обрабатывается» → «Видео готово»;
// пока обрабатывается — «Не заполнено», затем блок виден в «Как увидит ученик»; ссылка по-прежнему работает.
import { expect, openNewLesson, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const mp4 = Buffer.from('не настоящее видео — фейковый провайдер файл не читает')

test('видео: загрузить файл → обработка → готово', async ({ page, loginAs }) => {
	test.setTimeout(60_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Урок с видео')

	await page.getByTestId('block-palette-video').click()
	const block = page.getByTestId('lesson-block').last()
	await expect(block.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: нет ссылки на видео')

	await block.getByRole('button', { name: 'Загрузить файл' }).click()
	await expect(block.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: видео не загружено')
	await block.locator('input[type=file]').setInputFiles({ name: 'урок.pdf', mimeType: 'application/pdf', buffer: mp4 })
	await expect(block.getByRole('alert')).toHaveText('Такой тип файла здесь не подходит.')

	await block.locator('input[type=file]').setInputFiles({ name: 'урок.mp4', mimeType: 'video/mp4', buffer: mp4 })
	const status = block.getByTestId(/-status$/)
	await expect(status).toHaveAttribute('data-status', 'processing')
	await expect(block.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: видео ещё обрабатывается')
	await shoot(page, 'video-processing')

	// фейковый провайдер «обрабатывает» 3 с; редактор сам опрашивает статус
	await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })
	await expect(status).toHaveText('Видео готово')
	await expect(block.getByTestId('lesson-block-issues')).toHaveCount(0)

	await page.getByTestId('lesson-mode-preview').click()
	await expect(page.getByTestId('lesson-preview').locator('iframe')).toBeVisible()
	await shoot(page, 'video-ready')
})

test('видео: ошибка обработки', async ({ page, loginAs }) => {
	test.setTimeout(60_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Урок с битым видео')
	await page.getByTestId('block-palette-video').click()
	const block = page.getByTestId('lesson-block').last()
	await block.getByRole('button', { name: 'Загрузить файл' }).click()
	await block.locator('input[type=file]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: mp4 })
	await expect(block.getByTestId(/-status$/)).toHaveAttribute('data-status', 'failed', { timeout: 15_000 })
	await expect(block.getByTestId('lesson-block-issues')).toContainText('видео не обработано')
})
