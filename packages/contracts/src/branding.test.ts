import { describe, expect, it } from 'vitest'
import {
	adjustForContrast,
	brandingCss,
	brandingTokens,
	checkBrandColor,
	contrastRatio,
	DARK_BACKGROUND,
	DEFAULT_BRANDING,
	foregroundFor,
	LIGHT_BACKGROUND,
	MIN_CONTRAST,
} from './branding.ts'

describe('оформление школы: цвета', () => {
	it('контраст по WCAG', () => {
		expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
		expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
	})

	it('текст на кнопке — контрастный к цвету', () => {
		for (const c of ['#ffd400', '#1d4ed8', '#16a34a', '#e11d48', '#000000', '#ffffff'])
			expect(contrastRatio(c, foregroundFor(c))).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	it('слабый цвет отклоняется с подсказкой, которая проходит', () => {
		const yellow = checkBrandColor('#ffd400')
		expect(yellow.ok).toBe(false)
		expect(yellow.suggestion).not.toBeNull()
		expect(contrastRatio(yellow.suggestion as string, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(MIN_CONTRAST)
		expect(checkBrandColor('#1d4ed8')).toMatchObject({ ok: true, suggestion: null })
	})

	it('для тёмной темы цвет осветляется до контраста', () => {
		const navy = '#1e3a8a'
		const forDark = adjustForContrast(navy, DARK_BACKGROUND)
		expect(forDark).not.toBe(navy)
		expect(contrastRatio(forDark, DARK_BACKGROUND)).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	it('тема Dinastia — без переопределений токенов', () => {
		expect(brandingTokens(DEFAULT_BRANDING)).toEqual({ light: {}, dark: {} })
		expect(brandingCss(DEFAULT_BRANDING)).toBe(':root:root{--default-scheme:system;}\n:root.dark{}\n')
	})

	it('цвет, шрифт и скругления попадают в CSS обеих тем', () => {
		const css = brandingCss({ ...DEFAULT_BRANDING, primaryColor: '#1d4ed8', font: 'inter', radius: 'large' })
		expect(css).toContain('--primary:#1d4ed8;')
		expect(css).toContain("--font-sans:'Inter Variable'")
		expect(css).toContain('--radius:1rem;')
		expect(css.split('\n')[1]).toContain('--primary:')
	})
})
