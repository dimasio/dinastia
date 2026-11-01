// Медиа (карточка 2.7): обложка курса; блок «Картинка» без файла — «Не заполнено», загрузка → «Как увидит ученик»;
// блок «Файл» → «Скачать»; картинка внутри текста. Файлы уходят в S3 напрямую (SeaweedFS локально).
import { expect, openNewLesson, type Page, test } from './fixtures.ts'
import { shoot } from './shots.ts'

// PNG 16×16 (синий) — настоящий файл
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNQTX5NEmIY1TCqYfhqAAB2SXMQ7mVTQgAAAABJRU5ErkJggg==',
	'base64',
)
const pdf = Buffer.from('%PDF-1.4\n%конспект\n')

const saved = (page: Page) => page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())

test('обложка курса, картинка, файл и картинка в тексте', async ({ page, loginAs }) => {
	test.setTimeout(90_000) // два экрана, четыре загрузки и снимки
	await loginAs('teacher')
	await openNewLesson(page, 'Материалы урока')

	// картинка: пустой блок помечен, загрузка → превью и сохранение
	await page.getByTestId('block-palette-image').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(1)
	const image = page.getByTestId('lesson-block').last()
	await expect(image.getByTestId('lesson-block-issues')).toHaveText('Не заполнено: нет картинки')
	const imageSaved = saved(page)
	await image.locator('input[type=file]').setInputFiles({ name: 'схема.png', mimeType: 'image/png', buffer: png })
	await imageSaved
	await expect(image.getByTestId('lesson-block-issues')).toHaveCount(0)
	await expect(image.locator('img')).toBeVisible()
	await image.getByLabel('Описание для незрячих').fill('Синий квадрат')

	// файл: не тот тип — ошибка до загрузки; PDF → карточка с размером
	await page.getByTestId('block-palette-file').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(2)
	const file = page.getByTestId('lesson-block').last()
	await file.locator('input[type=file]').setInputFiles({ name: 'вирус.html', mimeType: 'text/html', buffer: pdf })
	await expect(file.getByRole('alert')).toHaveText('Такой тип файла здесь не подходит.')
	const fileSaved = saved(page)
	await file
		.locator('input[type=file]')
		.setInputFiles({ name: 'Конспект.pdf', mimeType: 'application/pdf', buffer: pdf })
	await fileSaved
	await expect(file).toContainText('Конспект.pdf')

	// картинка в тексте
	await page.getByTestId('block-palette-text').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(3)
	const text = page.getByTestId('lesson-block').last()
	await text.getByRole('textbox', { name: 'Текст' }).click()
	await page.keyboard.type('Посмотрите на схему:')
	const textSaved = saved(page)
	await text.locator('input[type=file]').setInputFiles({ name: 'фото.png', mimeType: 'image/png', buffer: png })
	await textSaved
	await expect(text.locator('img')).toBeVisible()
	await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved')
	await shoot(page, 'media-editor')

	// после перезагрузки — ссылки с сервера; «Как увидит ученик»
	await page.reload()
	await page.getByTestId('lesson-mode-preview').click()
	const preview = page.getByTestId('lesson-preview')
	await expect(preview.getByRole('img', { name: 'Синий квадрат' })).toBeVisible()
	await expect(preview.locator('img')).toHaveCount(2)
	const download = preview.getByRole('link', { name: 'Скачать' })
	await expect(download).toHaveAttribute('href', /X-Amz-Signature/)
	await expect(preview).toContainText('PDF')
	await shoot(page, 'media-preview')

	// обложка курса
	await page.getByTestId('lesson-back').click()
	const cover = page.getByTestId('course-cover')
	await expect(cover.getByRole('button', { name: 'Загрузить обложку' })).toBeVisible()
	await page.getByTestId('course-cover-file').setInputFiles({ name: 'обложка.png', mimeType: 'image/png', buffer: png })
	await expect(page.getByTestId('course-cover-preview')).toBeVisible()
	await page.reload()
	await expect(page.getByTestId('course-cover-preview')).toHaveAttribute('src', /X-Amz-Signature/)
	await shoot(page, 'media-cover')
	await page.getByTestId('course-cover-remove').click()
	await expect(page.getByTestId('course-cover-preview')).toHaveCount(0)
})
