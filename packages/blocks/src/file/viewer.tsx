import type { BlockViewerProps } from '../types.ts'
import { FileCard } from './card.tsx'
import type { file } from './definition.ts'
import { DocumentViewer } from './document-viewer.tsx'
import { previewKind } from './preview.ts'

/** PDF, Word, PowerPoint — просмотр в теме без скачивания; остальное — карточка «Скачать»; нет файла (черновик) — ничего. */
export default function FileViewer({ data, files, testId }: BlockViewerProps<typeof file>) {
	const f = data.fileId ? files[data.fileId] : undefined
	if (!f) return null
	const title = data.title || f.name
	const kind = previewKind(f.mime)
	if (!kind) return <FileCard title={title} file={f} testId={testId} />
	return (
		<figure className="grid min-w-0 gap-2" data-testid={testId}>
			<figcaption className="font-medium">{title}</figcaption>
			<DocumentViewer url={f.url} kind={kind} title={title} testId={`${testId}-preview`} />
		</figure>
	)
}
