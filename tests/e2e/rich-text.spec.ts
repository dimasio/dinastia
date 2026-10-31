// Rich text (пункт 1.12): поле RichText в форме ресурса — редактор профиля, вставка из буфера приводится к профилю,
// просмотр без innerHTML. Песочница /dev/rich-text есть только в режиме разработки (e2e идёт против vite dev).
import { expect, test } from '@playwright/test'

test('форма ресурса с полем RichText: форматирование, ссылка, вставка чужого HTML', async ({ page }) => {
	await page.goto('/dev/rich-text')
	await page.getByTestId('sandbox-title').fill('Курс по акварели')

	const editor = page.getByTestId('sandbox-description')
	await expect(editor).toBeVisible() // редактор загрузился лениво
	await editor.click()
	const toolbar = page.getByRole('toolbar', { name: 'Форматирование' })
	await toolbar.getByRole('button', { name: 'Жирный' }).click()
	await page.keyboard.type('Важно')
	await toolbar.getByRole('button', { name: 'Жирный' }).click()
	await page.keyboard.type(' и обычно. Наш сайт')

	// выделить «сайт» и сделать ссылкой (без протокола — допишется https://)
	for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft')
	await toolbar.getByRole('button', { name: 'Ссылка' }).click()
	await page.getByRole('textbox', { name: 'Адрес ссылки' }).fill('javascript:alert(1)')
	await page.getByRole('button', { name: 'Сохранить' }).click()
	await expect(page.getByRole('alert')).toContainText('http://, https:// или mailto:')
	await page.getByRole('textbox', { name: 'Адрес ссылки' }).fill('example.com')
	await page.getByRole('button', { name: 'Сохранить' }).click()

	// вставка из «Word»: h1, внешняя картинка, скрипт, опасная ссылка, чужой цвет — в профиль не проходят
	await editor.click()
	await page.keyboard.press('End')
	await editor.evaluate((el) => {
		const data = new DataTransfer()
		data.setData(
			'text/html',
			'<h1>Заголовок из Word</h1><p><span style="color:#ff0000">красный</span> <img src="https://evil.example/x.png">' +
				'<a href="javascript:alert(1)">клик</a></p><script>window.pwned = 1</script><h3>Раздел</h3>',
		)
		el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
	})

	await page.getByTestId('sandbox-submit').click()
	const result = page.getByTestId('sandbox-view')
	await expect(page.getByTestId('sandbox-verdict')).toHaveText('Профиль принимает документ')
	await expect(result.locator('strong')).toHaveText('Важно')
	const link = result.getByRole('link', { name: 'сайт' })
	await expect(link).toHaveAttribute('href', 'https://example.com')
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
	await expect(result.locator('h3')).toHaveText('Раздел')
	await expect(result.locator('img')).toHaveCount(0)
	await expect(result.locator('a[href^="javascript"]')).toHaveCount(0)
	await expect(page.getByTestId('sandbox-plain')).toContainText('Заголовок из Word')
	await expect(page.getByTestId('sandbox-plain')).toContainText('красный')
	expect(await page.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined()
})

test('пустое название — ошибка поля; мобильная ширина без горизонтальной прокрутки', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 })
	await page.goto('/dev/rich-text')
	await expect(page.getByTestId('sandbox-description')).toBeVisible()
	await page.getByTestId('sandbox-submit').click()
	await expect(page.getByTestId('sandbox-title')).toHaveAttribute('aria-invalid', 'true')
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
