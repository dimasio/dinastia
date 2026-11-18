// PowerPoint — pptx-preview: слайды списком по ширине контейнера. Точность ниже, чем у PDF (шрифты, сложные фигуры).
import { init } from 'pptx-preview'

export async function render(data: ArrayBuffer, el: HTMLElement) {
	// внутренние отступы рамки (p-2) — слайд не шире содержимого
	const width = el.clientWidth - 16 || 800
	const viewer = init(el, { width, height: Math.round((width * 9) / 16), mode: 'list' })
	await viewer.preview(data)
	// разбор файла упал внутри библиотеки (она глотает ошибку) — показать «не удалось», а не пустой слайд
	if (viewer.slideCount === 0) throw new Error('pptx: слайды не прочитаны')
}
