// Оформление школы (5.9, спека branding.md, D-065): схемы и расчёт токенов темы из цветов школы. Расчёт — чистые функции:
// сервер строит из них CSS `/api/branding.css`, экран «Оформление» — предпросмотр до сохранения.
import { z } from 'zod'

export const BRANDING_FONTS = ['system', 'pt-sans', 'inter', 'montserrat', 'roboto', 'pt-serif'] as const
export const BrandingFont = z.enum(BRANDING_FONTS)
export type BrandingFont = z.infer<typeof BrandingFont>

export const BRANDING_RADII = ['none', 'small', 'medium', 'large'] as const
export const BrandingRadius = z.enum(BRANDING_RADII)
export type BrandingRadius = z.infer<typeof BrandingRadius>

export const COLOR_SCHEMES = ['light', 'dark', 'system'] as const
export const ColorScheme = z.enum(COLOR_SCHEMES)
export type ColorScheme = z.infer<typeof ColorScheme>

export const HexColor = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^#[0-9a-f]{6}$/)
export type HexColor = z.infer<typeof HexColor>

/** Логотип и фавикон: назначения файлов модуля schools; SVG не принимаем (XSS). */
export const BRANDING_LOGO = {
	purpose: 'schools.logo',
	maxSize: 1024 * 1024,
	mime: ['image/png', 'image/jpeg', 'image/webp'],
} as const
export const BRANDING_FAVICON = { purpose: 'schools.favicon', maxSize: 256 * 1024, mime: ['image/png'] } as const

/** Оформление школы без файлов: то, из чего строятся токены. null — как в теме Dinastia. */
export const BrandingTheme = z.object({
	primaryColor: HexColor.nullable(),
	accentColor: HexColor.nullable(),
	font: BrandingFont,
	radius: BrandingRadius,
	defaultScheme: ColorScheme,
})
export type BrandingTheme = z.infer<typeof BrandingTheme>

export const DEFAULT_BRANDING: BrandingTheme = {
	primaryColor: null,
	accentColor: null,
	font: 'system',
	radius: 'medium',
	defaultScheme: 'system',
}

/** Минимальный контраст текста (WCAG AA). */
export const MIN_CONTRAST = 4.5

// --- цвет: sRGB ↔ OKLab (Björn Ottosson) и контраст WCAG 2.x ---

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
	const n = Number.parseInt(hex.slice(1), 16)
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function rgbToHex(rgb: Rgb): string {
	return `#${rgb
		.map((c) =>
			Math.round(Math.min(1, Math.max(0, c)) * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** Относительная яркость WCAG. */
function luminance(hex: string): number {
	const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Контраст двух цветов по WCAG (1…21). */
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
	return (hi + 0.05) / (lo + 0.05)
}

interface Oklch {
	l: number
	c: number
	h: number
}

function toOklch(hex: string): Oklch {
	const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb
	const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
	const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
	const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
	return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI }
}

function fromOklch({ l, c, h }: Oklch): string {
	const A = c * Math.cos((h * Math.PI) / 180)
	const B = c * Math.sin((h * Math.PI) / 180)
	const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
	const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
	const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
	const rgb: Rgb = [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
	]
	return rgbToHex(rgb.map(fromLinear) as Rgb)
}

/** Фоны тем Dinastia (`globals.css`: oklch(1 0 0) и oklch(0.145 0 0)). */
export const LIGHT_BACKGROUND = '#ffffff'
export const DARK_BACKGROUND = '#0a0a0a'
const INK_LIGHT = '#fafafa'
const INK_DARK = '#171717'

/** Текст поверх цвета: светлый или тёмный — что контрастнее. */
export function foregroundFor(hex: string): string {
	return contrastRatio(hex, INK_LIGHT) >= contrastRatio(hex, INK_DARK) ? INK_LIGHT : INK_DARK
}

/**
 * Ближайший по светлоте оттенок цвета с контрастом ≥ min к фону (тон и насыщенность — те же). Светлый фон — темнее,
 * тёмный — светлее. Уже подходит — сам цвет.
 */
export function adjustForContrast(hex: string, background: string, min = MIN_CONTRAST): string {
	if (contrastRatio(hex, background) >= min) return hex
	const base = toOklch(hex)
	const darker = luminance(background) > 0.5
	for (let step = 1; step <= 100; step++) {
		const l = darker ? base.l - step * 0.01 : base.l + step * 0.01
		if (l <= 0 || l >= 1) break
		const candidate = fromOklch({ ...base, l })
		if (contrastRatio(candidate, background) >= min) return candidate
	}
	return darker ? '#000000' : '#ffffff'
}

/** Проверка цвета школы: как ссылка на светлом фоне — ≥ 4.5:1; иначе — подсказка ближайшего подходящего оттенка. */
export function checkBrandColor(hex: string): { ok: boolean; ratio: number; suggestion: string | null } {
	const ratio = contrastRatio(hex, LIGHT_BACKGROUND)
	const ok = ratio >= MIN_CONTRAST
	return { ok, ratio: Math.round(ratio * 100) / 100, suggestion: ok ? null : adjustForContrast(hex, LIGHT_BACKGROUND) }
}

/** Мягкий фон оттенка цвета (наведение, выбранный пункт меню) и текст на нём. */
function tint(hex: string, dark: boolean): { bg: string; fg: string } {
	const { c, h } = toOklch(hex)
	const bg = fromOklch({ l: dark ? 0.3 : 0.96, c: Math.min(c, dark ? 0.06 : 0.03), h })
	const fg = adjustForContrast(fromOklch({ l: dark ? 0.92 : 0.3, c: Math.min(c, 0.12), h }), bg)
	return { bg, fg }
}

export const RADIUS_REM: Record<BrandingRadius, string> = {
	none: '0rem',
	small: '0.375rem',
	medium: '0.625rem',
	large: '1rem',
}

/** Семейство шрифта: встроенные `@fontsource` (подключены в вебе), `system` — системный. */
export const FONT_FAMILY: Record<BrandingFont, string> = {
	system: 'ui-sans-serif, system-ui, sans-serif',
	'pt-sans': "'PT Sans', ui-sans-serif, system-ui, sans-serif",
	inter: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
	montserrat: "'Montserrat Variable', ui-sans-serif, system-ui, sans-serif",
	roboto: "'Roboto Variable', ui-sans-serif, system-ui, sans-serif",
	'pt-serif': "'PT Serif', ui-serif, Georgia, serif",
}

export type ThemeTokens = Record<`--${string}`, string>

/** Токены светлой и тёмной темы из оформления школы; только то, что отличается от темы Dinastia. */
export function brandingTokens(theme: BrandingTheme): { light: ThemeTokens; dark: ThemeTokens } {
	const light: ThemeTokens = {}
	const dark: ThemeTokens = {}
	if (theme.radius !== 'medium') light['--radius'] = RADIUS_REM[theme.radius]
	if (theme.font !== 'system') light['--font-sans'] = FONT_FAMILY[theme.font]
	if (theme.primaryColor) {
		const p = adjustForContrast(theme.primaryColor, LIGHT_BACKGROUND)
		const pd = adjustForContrast(theme.primaryColor, DARK_BACKGROUND)
		Object.assign(light, { '--primary': p, '--primary-foreground': foregroundFor(p), '--ring': p })
		Object.assign(dark, { '--primary': pd, '--primary-foreground': foregroundFor(pd), '--ring': pd })
	}
	const accent = theme.accentColor ?? theme.primaryColor
	if (accent) {
		for (const [tokens, isDark] of [
			[light, false],
			[dark, true],
		] as const) {
			const { bg, fg } = tint(accent, isDark)
			Object.assign(tokens, {
				'--accent': bg,
				'--accent-foreground': fg,
				'--sidebar-accent': bg,
				'--sidebar-accent-foreground': fg,
			})
		}
	}
	return { light, dark }
}

const declarations = (tokens: ThemeTokens) =>
	Object.entries(tokens)
		.map(([k, v]) => `${k}:${v};`)
		.join('')

/**
 * CSS темы школы. Селекторы `:root:root` и `:root.dark` сильнее `:root` и `.dark` дизайн-системы — порядок подключения
 * стилей не важен. `--default-scheme` читает `ThemeProvider` (тема по умолчанию для нового посетителя).
 */
export function brandingCss(theme: BrandingTheme): string {
	const { light, dark } = brandingTokens(theme)
	return `:root:root{--default-scheme:${theme.defaultScheme};${declarations(light)}}\n:root.dark{${declarations(dark)}}\n`
}
