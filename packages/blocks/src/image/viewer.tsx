import type { BlockViewerProps } from '../types.ts'
import type { image } from './definition.ts'

/** Картинка по ширине урока, не шире оригинала; нет файла (черновик) — ничего. */
export default function ImageViewer({ data, files, testId }: BlockViewerProps<typeof image>) {
	const src = data.fileId ? files[data.fileId]?.url : undefined
	if (!src) return null
	return (
		<figure className="grid gap-2" data-testid={testId}>
			<img src={src} alt={data.alt ?? ''} loading="lazy" className="h-auto max-w-full rounded-md" />
			{data.caption && <figcaption className="text-muted-foreground text-sm">{data.caption}</figcaption>}
		</figure>
	)
}
