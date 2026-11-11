// Скриншоты для просмотра глазами (скилл visual-review): светлая и тёмная тема, ширина 375px — в
// screens/<имя>-{light,dark,mobile}.png. Заодно проверяет то, что e2e обычно не видит: пропущенные
// строки (⟦ключ⟧ — i18n вне production) и горизонтальную прокрутку на телефоне.
import { expect, type Locator, type Page } from '@playwright/test'

// своя папка: test-results Playwright очищает в начале каждого прогона
const DIR = 'screens'

export interface ShootOptions {
	/** Снять только этот элемент (по умолчанию — вся страница). */
	target?: Locator
	/** Снимок на 375px и проверка прокрутки (по умолчанию — да). */
	mobile?: boolean
}

/** Снять экран в трёх видах; вернёт пути файлов — открыть и посмотреть (Read / просмотрщик). */
export async function shoot(page: Page, name: string, opts: ShootOptions = {}): Promise<string[]> {
	const paths: string[] = []
	const snap = async (variant: string) => {
		const path = `${DIR}/${name}-${variant}.png`
		await (opts.target ? opts.target.screenshot({ path }) : page.screenshot({ path, fullPage: true }))
		paths.push(path)
	}
	await expect(page.locator('body'), 'на экране пропущенная строка i18n (⟦ключ⟧)').not.toContainText('⟦')
	// дождаться текущих анимаций (закрытие диалога): если отключить их посреди — Radix не получит animationend и
	// оставит диалог на экране
	await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
	// без переходов: иначе после смены темы снимок ловит середину transition-colors (тёмный текст на тёмном фоне)
	await page.addStyleTag({
		content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
	})

	await snap('light')
	await page.evaluate(() => document.documentElement.classList.add('dark'))
	await snap('dark')
	await page.evaluate(() => document.documentElement.classList.remove('dark'))

	if (opts.mobile !== false) {
		const size = page.viewportSize()
		await page.setViewportSize({ width: 375, height: 800 })
		// раскладка перестраивается после смены размера (таблица ресурса → карточки по matchMedia) — ждём, пока установится; сама
		// проверка не мягче: прокрутки на 375px быть не должно
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
				message: 'горизонтальная прокрутка страницы на 375px',
				timeout: 3_000,
			})
			.toBeLessThanOrEqual(0)
		await snap('mobile')
		if (size) await page.setViewportSize(size)
	}
	return paths
}
