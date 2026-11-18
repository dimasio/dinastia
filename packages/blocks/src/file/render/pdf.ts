// PDF — pdf.js: страницы картинками на canvas по ширине контейнера (текст не выделяется — копировать неудобно).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = worker

export async function render(data: ArrayBuffer, el: HTMLElement, signal: AbortSignal) {
	const task = getDocument({ data })
	const doc = await task.promise
	try {
		const width = el.clientWidth - 16 || 800
		const ratio = window.devicePixelRatio || 1
		for (let n = 1; n <= doc.numPages && !signal.aborted; n++) {
			const page = await doc.getPage(n)
			const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio })
			const canvas = document.createElement('canvas')
			canvas.width = Math.floor(viewport.width)
			canvas.height = Math.floor(viewport.height)
			canvas.className = 'block w-full bg-white shadow-sm'
			canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`
			el.append(canvas)
			await page.render({ canvas, viewport }).promise
		}
	} finally {
		void task.destroy()
	}
}
