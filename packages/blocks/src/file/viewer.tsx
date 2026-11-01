import type { BlockViewerProps } from '../types.ts'
import { FileCard } from './card.tsx'
import type { file } from './definition.ts'

/** Файл для скачивания; нет файла (черновик) — ничего. */
export default function FileViewer({ data, files, testId }: BlockViewerProps<typeof file>) {
	const f = data.fileId ? files[data.fileId] : undefined
	if (!f) return null
	return <FileCard title={data.title || f.name} file={f} testId={testId} />
}
