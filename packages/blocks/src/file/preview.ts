/** Документы, которые показываются прямо в теме (без скачивания): PDF, Word, PowerPoint. Остальное — карточкой «Скачать». */
export const PREVIEW_MIME = {
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
} as const

export type PreviewKind = (typeof PREVIEW_MIME)[keyof typeof PREVIEW_MIME]

export const previewKind = (mime: string): PreviewKind | null =>
	(PREVIEW_MIME as Record<string, PreviewKind>)[mime] ?? null
