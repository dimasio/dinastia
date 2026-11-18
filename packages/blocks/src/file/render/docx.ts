// Word — docx-preview: HTML со страницами документа; страница шире рамки (телефон) — уменьшается под ширину (zoom).
import { renderAsync } from 'docx-preview'

export async function render(data: ArrayBuffer, el: HTMLElement) {
	await renderAsync(data, el, undefined, {
		className: 'docx',
		inWrapper: true,
		breakPages: true,
		ignoreLastRenderedPageBreak: true,
		renderHeaders: true,
		renderFooters: true,
		experimental: false,
		useBase64URL: true,
	})
	const page = el.querySelector<HTMLElement>('section.docx')
	const wrapper = el.querySelector<HTMLElement>('.docx-wrapper')
	if (page && wrapper && page.offsetWidth > el.clientWidth)
		wrapper.style.zoom = String((el.clientWidth - 16) / page.offsetWidth)
}
