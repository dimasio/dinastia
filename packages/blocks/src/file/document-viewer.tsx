import { Skeleton } from '@dinastia/ui'
import { FileWarning } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PreviewKind } from './preview.ts'

// библиотеки просмотра — отдельными чанками, только когда документ этого вида открыт
const renderers: Record<
	PreviewKind,
	() => Promise<{ render: (data: ArrayBuffer, el: HTMLElement, signal: AbortSignal) => Promise<void> }>
> = {
	pdf: () => import('./render/pdf.ts'),
	docx: () => import('./render/docx.ts'),
	pptx: () => import('./render/pptx.ts'),
}

/**
 * Просмотр документа в теме: файл по подписанной ссылке → рендер в браузере. Кнопки «Скачать» нет; контекстное меню
 * отключено (полностью от сохранения это не защищает — браузер файл получил).
 */
export function DocumentViewer({
	url,
	kind,
	title,
	testId,
}: {
	url: string
	kind: PreviewKind
	title: string
	testId: string
}) {
	const { t } = useTranslation('blocks')
	const ref = useRef<HTMLDivElement>(null)
	const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
	// ширина рамки шагом 40px: повернули телефон, поменяли окно — перерисовать по новой ширине (файл не качаем заново)
	const [width, setWidth] = useState(0)
	const data = useRef<{ url: string; body: Promise<ArrayBuffer> } | null>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return
		const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth / 40) * 40))
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		const el = ref.current
		if (!el || !width) return
		const ac = new AbortController()
		setState('loading')
		el.replaceChildren()
		if (data.current?.url !== url)
			data.current = {
				url,
				body: fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))),
			}
		const body = data.current.body
		;(async () => {
			const [buf, mod] = await Promise.all([body, renderers[kind]()])
			if (!ac.signal.aborted) await mod.render(buf.slice(0), el, ac.signal)
		})().then(
			() => !ac.signal.aborted && setState('ready'),
			() => !ac.signal.aborted && setState('error'),
		)
		return () => {
			ac.abort()
			el.replaceChildren()
		}
	}, [url, kind, width])

	return (
		<div className="relative min-w-0" data-testid={testId} data-state={state} data-kind={kind}>
			{state === 'loading' && <Skeleton className="h-64 w-full" />}
			{state === 'error' && (
				<p className="flex items-center gap-2 rounded-md border p-3 text-muted-foreground text-sm" role="alert">
					<FileWarning className="size-4 shrink-0" aria-hidden />
					{t('file.previewFailed')}
				</p>
			)}
			<section
				ref={ref}
				aria-label={title}
				onContextMenu={(e) => e.preventDefault()}
				className={
					state === 'error'
						? 'hidden'
						: 'grid max-h-[80svh] min-w-0 gap-3 overflow-auto rounded-md border bg-muted p-2 [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-0 [&_section.docx]:!mb-3'
				}
			/>
		</div>
	)
}
