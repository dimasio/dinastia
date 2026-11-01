// Блоки урока (пункт 1.3): палитра из реестра → редактор черновика (BlockEditorHost) → публикация (toPublic) →
// просмотр ученика (BlockViewerHost). Песочница /dev/blocks — только в режиме разработки.
import { expect, test } from '@playwright/test'

test('выноска: из палитры в черновик, правка, публикация, просмотр', async ({ page }) => {
	await page.goto('/dev/blocks')
	const palette = page.getByRole('navigation', { name: 'Добавить блок' })
	await expect(palette.getByText('Основное', { exact: true })).toBeVisible() // категория
	await palette.getByTestId('block-palette-callout').click()

	await page.getByTestId('draft-0-tone').click()
	await page.getByRole('option', { name: 'Внимание' }).click()
	const body = page.getByTestId('draft-0-body')
	await expect(body).toBeVisible()
	await body.click()
	await page.keyboard.type('Сдайте задание до пятницы')
	await page.waitForTimeout(300) // хост отдаёт значение с задержкой (delayMs)

	await page.getByTestId('sandbox-publish').click()
	const viewer = page.getByTestId('published-0')
	await expect(viewer).toHaveAttribute('data-tone', 'warning')
	await expect(viewer).toHaveAccessibleName('Внимание')
	await expect(viewer).toContainText('Сдайте задание до пятницы')

	// второй блок и удаление первого из черновика: опубликованное не меняется до новой публикации
	await palette.getByTestId('block-palette-callout').click()
	await expect(page.getByTestId('draft-1')).toBeVisible()
	await page.getByRole('button', { name: 'Удалить блок' }).first().click()
	await expect(page.getByTestId('published-0')).toContainText('Сдайте задание до пятницы')
	await page.getByTestId('sandbox-publish').click()
	await expect(page.getByTestId('published-0')).toHaveAttribute('data-tone', 'info')
	await expect(page.getByTestId('published-1')).toHaveCount(0)
})

test('мобильная ширина: палитра и редактор без горизонтальной прокрутки', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 })
	await page.goto('/dev/blocks')
	await page.getByTestId('block-palette-callout').click()
	await expect(page.getByTestId('draft-0-body')).toBeVisible()
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
