// Блоки контента (карточка 2.4): текст, заголовок, код с подсветкой, разделитель, видео и встраивание по ссылке —
// в конструкторе урока и «Как увидит ученик»; ссылка вне белого списка не сохраняется.
import { expect, openNewLesson, type Page, test } from './fixtures.ts'
import { shoot } from './shots.ts'

/** Добавить блок из палитры, заполнить и дождаться автосохранения. */
async function add(page: Page, type: string, fill?: (block: ReturnType<Page['getByTestId']>) => Promise<void>) {
	const before = await page.getByTestId('lesson-block').count()
	await page.getByTestId(`block-palette-${type}`).click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(before + 1)
	if (!fill) return
	const saved = page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())
	await fill(page.getByTestId('lesson-block').last())
	await saved
}

test('урок из блоков контента и как его увидит ученик', async ({ page, loginAs }) => {
	test.setTimeout(90_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Материалы')

	await add(page, 'heading', (b) => b.getByLabel('Текст заголовка').fill('Что понадобится'))
	await add(page, 'text', async (b) => {
		await b.getByRole('textbox', { name: 'Текст' }).click()
		await page.keyboard.type('Бумага, кисти и краски.')
	})
	await add(page, 'code', async (b) => {
		await b.getByRole('combobox', { name: 'Язык' }).click()
		await page.getByRole('option', { name: 'Python' }).click()
		await b.getByLabel('Код').fill('print("Привет, акварель")')
	})
	await add(page, 'divider')
	await add(page, 'video', (b) => b.getByLabel('Ссылка на видео').fill('https://youtu.be/dQw4w9WgXcQ'))

	// встраивание: чужой сайт — ошибка у поля и на сервер не уходит; форма из списка — сохраняется
	await page.getByTestId('block-palette-embed').click()
	const embed = page.getByTestId('lesson-block').last()
	await embed.getByLabel('Ссылка', { exact: true }).fill('https://evil.example/form')
	await expect(embed.getByRole('alert').first()).toContainText('Этот сервис нельзя встроить')
	const saved = page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())
	await embed.getByLabel('Ссылка', { exact: true }).fill('https://forms.yandex.ru/u/abc123/')
	await saved
	await expect(embed.getByRole('alert')).toHaveCount(0)
	await expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved')
	await shoot(page, 'content-blocks-editor')

	// после перезагрузки — «Как увидит ученик»
	await page.reload()
	await page.getByTestId('lesson-mode-preview').click()
	const preview = page.getByTestId('lesson-preview')
	await expect(preview.getByRole('heading', { name: 'Что понадобится', level: 2 })).toBeVisible()
	await expect(preview).toContainText('Бумага, кисти и краски.')
	const code = preview.locator('[data-language="python"]')
	await expect(code).toContainText('print("Привет, акварель")')
	await expect(code.getByRole('button', { name: 'Копировать' })).toBeVisible()
	await expect(preview.getByRole('separator')).toHaveCount(1)
	const frames = preview.locator('iframe')
	await expect(frames).toHaveCount(2)
	await expect(frames.nth(0)).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
	await expect(frames.nth(1)).toHaveAttribute('src', 'https://forms.yandex.ru/u/abc123/?iframe=1')
	await expect(frames.nth(0)).toHaveAttribute('sandbox', /allow-scripts/)
	await shoot(page, 'content-blocks-preview')
})
