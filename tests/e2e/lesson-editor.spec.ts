// Конструктор урока (карточка 2.3): блок из палитры, правка с автосохранением, порядок, удаление с подтверждением,
// «Как увидит ученик»; на телефоне палитра — в нижней панели; куратор — только просмотр.
import { expect, openDemoCourse, openNewLesson, type Page, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const saved = (page: Page) => expect(page.getByTestId('lesson-save-state')).toHaveAttribute('data-state', 'saved')
const blockTexts = (page: Page) =>
	page.getByTestId('lesson-block').getByRole('textbox', { name: 'Текст' }).allTextContents()

async function addCallout(page: Page, text: string) {
	const before = await page.getByTestId('lesson-block').count()
	await page.getByTestId('block-palette-callout').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(before + 1)
	const block = page.getByTestId('lesson-block').last()
	// автосохранение: через 0,5 с после правки уходит запрос blocks.update
	const patched = page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())
	await block.getByRole('textbox', { name: 'Текст' }).click()
	await page.keyboard.type(text)
	await patched
	await saved(page)
}

test('преподаватель собирает урок из блоков', async ({ page, loginAs }) => {
	test.setTimeout(90_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Бумага')
	await expect(page.getByText('Урок пустой')).toBeVisible()

	await addCallout(page, 'Первый')
	await addCallout(page, 'Второй')
	// тип выноски — и он сохраняется
	const second = page.getByTestId('lesson-block').nth(1)
	await second.getByRole('combobox', { name: 'Тип' }).click()
	await page.getByRole('option', { name: 'Внимание' }).click()
	await saved(page)

	// порядок: перетаскиванием за ручку, затем обратно из меню
	const handle = second.getByRole('button', { name: 'Перетащить' })
	const from = await handle.boundingBox()
	const to = await page.getByTestId('lesson-block').first().boundingBox()
	if (!from || !to) throw new Error('нет координат')
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
	await page.mouse.down()
	await page.mouse.move(to.x + 20, to.y + 5, { steps: 12 })
	await page.mouse.up()
	await expect.poll(() => blockTexts(page)).toEqual(['Второй', 'Первый'])
	await saved(page)

	// после перезагрузки — то же: правки и порядок на сервере
	await page.reload()
	await expect.poll(() => blockTexts(page)).toEqual(['Второй', 'Первый'])
	await page.getByTestId('lesson-block').first().getByTestId('lesson-block-menu').click()
	await page.getByTestId('lesson-menu-down').click()
	await expect.poll(() => blockTexts(page)).toEqual(['Первый', 'Второй'])
	await shoot(page, 'lesson-editor')

	// как увидит ученик: выноски с типом, без редакторов
	await page.getByTestId('lesson-mode-preview').click()
	const preview = page.getByTestId('lesson-preview')
	await expect(preview.getByTestId('lesson-preview-block')).toHaveCount(2)
	await expect(preview.getByTestId('lesson-preview-block').nth(1)).toHaveAttribute('data-tone', 'warning')
	await expect(page.getByTestId('lesson-block')).toHaveCount(0)
	await expect(page.getByTestId('block-palette-callout')).toHaveCount(0)
	await shoot(page, 'lesson-preview')
	await page.getByTestId('lesson-mode-editor').click()

	// удаление — с подтверждением
	await page.getByTestId('lesson-block').first().getByTestId('lesson-block-menu').click()
	await page.getByTestId('lesson-menu-remove').click()
	await expect(page.getByRole('alertdialog')).toContainText('Удалить блок «Выноска»?')
	await shoot(page, 'lesson-remove-confirm', { target: page.getByRole('alertdialog'), mobile: false })
	await page.getByTestId('lesson-confirm').click()
	await expect.poll(() => blockTexts(page)).toEqual(['Второй'])

	// обратно в конструктор курса — «Открыть урок» из меню ведёт сюда же
	await page.getByTestId('lesson-back').click()
	await page.getByTestId('course-lesson').filter({ hasText: 'Бумага' }).getByTestId('course-item-menu').click()
	await page.getByTestId('course-menu-open').click()
	await expect(page.getByTestId('lesson-title')).toHaveText('Бумага')
})

test('на телефоне палитра — в нижней панели по «+ Блок»', async ({ page, loginAs }) => {
	await loginAs('teacher')
	await openNewLesson(page, 'Мобильный')
	await page.setViewportSize({ width: 375, height: 800 })
	await expect(page.getByTestId('block-palette-callout')).toBeHidden()
	await page.getByTestId('lesson-add-block').click()
	await page.getByTestId('block-palette-sheet-callout').click()
	await expect(page.getByTestId('lesson-block')).toHaveCount(1)
	await expect(page.getByRole('button', { name: 'Перетащить' })).toBeHidden()
	await saved(page)
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('куратор видит урок глазами ученика, без правки', async ({ page, loginAs }) => {
	await loginAs('curator')
	await openDemoCourse(page)
	await page.getByTestId('course-lesson-title').filter({ hasText: 'Бумага, кисти, краски' }).click()
	await expect(page.getByTestId('lesson-editor')).toBeVisible()
	await expect(page.getByTestId('lesson-preview-block').first()).toBeVisible()
	await expect(page.getByTestId('lesson-block')).toHaveCount(0)
	await expect(page.getByTestId('lesson-preview-toggle')).toHaveCount(0)
	await expect(page.getByTestId('lesson-save-state')).toHaveCount(0)
	await shoot(page, 'lesson-curator')
})
