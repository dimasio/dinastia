// HTML из документа rich text — для писем и PDF (скилл rich-text). Только на сервере и только из проверенного
// документа: текст и атрибуты экранируются, ссылки — разрешённых протоколов, картинки — по fileId через resolveFile.
import {
	isAllowedHref,
	RICH_TEXT_COLORS,
	type RichTextColor,
	type RichTextDoc,
	type RichTextNode,
} from '../common/rich-text.ts'

const esc = (s: string) =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')

export interface ToHtmlOptions {
	/** Ссылка на картинку по fileId (подписанная, с запасом срока для письма); null — картинку пропустить. */
	resolveFile?: (fileId: string) => string | null
}

type Mark = NonNullable<RichTextNode['marks']>[number]

function wrapMark(html: string, mark: Mark): string {
	switch (mark.type) {
		case 'bold':
			return `<strong>${html}</strong>`
		case 'italic':
			return `<em>${html}</em>`
		case 'underline':
			return `<u>${html}</u>`
		case 'strike':
			return `<s>${html}</s>`
		case 'code':
			return `<code>${html}</code>`
		case 'highlight':
			return `<mark>${html}</mark>`
		case 'link': {
			const href = mark.attrs?.href
			if (typeof href !== 'string' || !isAllowedHref(href)) return html
			return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${html}</a>`
		}
		case 'textStyle': {
			const color = mark.attrs?.color
			if (typeof color !== 'string' || !(color in RICH_TEXT_COLORS)) return html
			return `<span style="color:${RICH_TEXT_COLORS[color as RichTextColor]}">${html}</span>`
		}
		default:
			return html
	}
}

function cellAttrs(n: RichTextNode): string {
	const colspan = Number(n.attrs?.colspan ?? 1)
	const rowspan = Number(n.attrs?.rowspan ?? 1)
	const align = ['left', 'center', 'right'].includes(String(n.attrs?.align))
		? ` style="text-align:${n.attrs?.align}"`
		: ''
	return `${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${align}`
}

function render(n: RichTextNode, opts: ToHtmlOptions): string {
	const inner = () => (n.content ?? []).map((c) => render(c, opts)).join('')
	switch (n.type) {
		case 'text':
			return (n.marks ?? []).reduce((html, m) => wrapMark(html, m), esc(n.text ?? ''))
		case 'paragraph':
			return `<p>${inner()}</p>`
		case 'heading': {
			const level = [2, 3, 4].includes(Number(n.attrs?.level)) ? Number(n.attrs?.level) : 2
			return `<h${level}>${inner()}</h${level}>`
		}
		case 'bulletList':
			return `<ul>${inner()}</ul>`
		case 'orderedList': {
			const start = Number(n.attrs?.start ?? 1)
			return `<ol${Number.isInteger(start) && start !== 1 ? ` start="${start}"` : ''}>${inner()}</ol>`
		}
		case 'listItem':
			return `<li>${inner()}</li>`
		case 'taskList':
			return `<ul style="list-style:none;padding-left:0">${inner()}</ul>`
		case 'taskItem':
			return `<li>${n.attrs?.checked === true ? '☑' : '☐'} ${inner()}</li>`
		case 'blockquote':
			return `<blockquote>${inner()}</blockquote>`
		case 'codeBlock':
			return `<pre><code>${inner()}</code></pre>`
		case 'horizontalRule':
			return '<hr>'
		case 'hardBreak':
			return '<br>'
		case 'image': {
			const fileId = n.attrs?.fileId
			const src = typeof fileId === 'string' ? opts.resolveFile?.(fileId) : null
			if (!src) return ''
			const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : ''
			return `<img src="${esc(src)}" alt="${esc(alt)}" style="max-width:100%">`
		}
		case 'table':
			return `<table><tbody>${inner()}</tbody></table>`
		case 'tableRow':
			return `<tr>${inner()}</tr>`
		case 'tableCell':
			return `<td${cellAttrs(n)}>${inner()}</td>`
		case 'tableHeader':
			return `<th${cellAttrs(n)}>${inner()}</th>`
		default:
			return ''
	}
}

/** HTML документа; неизвестные узлы и метки пропускаются (документ должен быть проверен схемой профиля). */
export function toHtml(doc: RichTextDoc | null | undefined, opts: ToHtmlOptions = {}): string {
	return (doc?.content ?? []).map((n) => render(n, opts)).join('')
}
