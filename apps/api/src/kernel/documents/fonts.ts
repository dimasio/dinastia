// Печатные шрифты документов: PT Serif и PT Sans (OFL, @fontsource) — латиница и кириллица, обычный и жирный, встроены в
// CSS как data URI (браузер документа без сети). CSS собирается один раз на процесс.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FAMILIES = ['@fontsource/pt-serif', '@fontsource/pt-sans'] as const
const WEIGHTS = ['400', '700'] as const
const SUBSETS = ['latin', 'cyrillic'] as const

let css: string | null = null

function familyCss(pkg: string): string {
	const dir = dirname(fileURLToPath(import.meta.resolve(pkg)))
	const out: string[] = []
	for (const subset of SUBSETS)
		for (const weight of WEIGHTS) {
			const source = readFileSync(join(dir, `${subset}-${weight}.css`), 'utf8')
			out.push(
				source.replace(/src:[^;]+;/, (src) => {
					const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(src)?.[1]
					if (!file) throw new Error(`шрифт ${pkg}: нет woff2 в ${subset}-${weight}.css`)
					const data = readFileSync(join(dir, 'files', file)).toString('base64')
					return `src: url(data:font/woff2;base64,${data}) format('woff2');`
				}),
			)
		}
	return out.join('\n')
}

/** `@font-face` всех печатных шрифтов. */
export function fontsCss(): string {
	css ??= FAMILIES.map(familyCss).join('\n')
	return css
}
