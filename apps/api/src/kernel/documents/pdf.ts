// PDF из HTML (D-013): только в фоновой задаче. Chromium (`playwright-core`) — один на процесс воркера, запускается при первом
// документе; на документ — свой контекст без JavaScript и без сети (внешние ресурсы отклоняются: шаблон не ходит наружу).

import type { Browser } from 'playwright-core'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DocumentDef } from './define.ts'
import { fontsCss } from './fonts.ts'

export const PDF_MIME = 'application/pdf'
const RENDER_TIMEOUT_MS = 30_000

let browser: Promise<Browser> | null = null

async function launch(): Promise<Browser> {
	const { chromium } = await import('playwright-core')
	// как e2e (playwright.config.ts): на macOS 13 Playwright не ставит свой Chromium — установленный Google Chrome; в Linux
	// (CI, образ воркера) — штатный `playwright-core install chromium-headless-shell`
	const b = await chromium.launch({
		args: ['--disable-dev-shm-usage'],
		...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
	})
	b.on('disconnected', () => {
		browser = null
	})
	return b
}

function getBrowser(): Promise<Browser> {
	browser ??= launch().catch((error) => {
		browser = null
		throw error
	})
	return browser
}

/** Закрыть браузер (остановка воркера, конец тестов). */
export async function closeBrowser() {
	const b = browser
	browser = null
	if (b) await (await b.catch(() => null))?.close()
}

/** Полный HTML документа: шрифты, лист A4 без полей, разметка шаблона. Он же — предпросмотр в браузере. */
export function documentHtml<D>(def: DocumentDef<D>, data: D): string {
	const size = def.orientation(data) === 'landscape' ? 'A4 landscape' : 'A4 portrait'
	const body = renderToStaticMarkup(def.render(data))
	return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${fontsCss()}
@page { size: ${size}; margin: 0 }
html, body { margin: 0; padding: 0 }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
</style></head><body>${body}</body></html>`
}

/** Напечатать документ в PDF; данные проверяются схемой документа. */
export async function renderPdf<D>(def: DocumentDef<D>, data: D): Promise<Uint8Array> {
	const parsed = def.schema.parse(data)
	const html = documentHtml(def, parsed)
	const context = await (await getBrowser()).newContext({ javaScriptEnabled: false })
	try {
		const page = await context.newPage()
		page.setDefaultTimeout(RENDER_TIMEOUT_MS)
		await page.route('**/*', (route) => route.abort())
		await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS })
		const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
		return new Uint8Array(pdf)
	} finally {
		await context.close()
	}
}
