// Медиа блоков урока (карточка 2.7): виды загружаемых файлов и их лимиты — общие для редакторов (проверка до загрузки)
// и назначений файлов на сервере (modules/courses/files.ts). Исполняемое браузером (html, svg) — не допускается.
const MB = 1024 * 1024
const GB = 1024 * MB

export const BLOCK_MEDIA = {
	image: { mime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxSize: 10 * MB },
	// видео грузится не в хранилище школы, а в сервис видео (tus, 2.4b)
	video: { mime: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'], maxSize: 2 * GB },
	file: {
		mime: [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.ms-powerpoint',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			'application/zip',
			'text/plain',
			'text/csv',
			'audio/mpeg',
		],
		maxSize: 100 * MB,
	},
} as const

export type BlockMediaKind = keyof typeof BLOCK_MEDIA

/** Файл, на который ссылается блок, — с подписанной ссылкой (выдаёт сервер, D-047). */
export interface BlockFile {
	url: string
	name: string
	mime: string
	size: number
}

/** Файлы блока по fileId — приходят рядом с данными блока. */
export type BlockFiles = Readonly<Record<string, BlockFile>>

/** Загрузка файла страницей-хостом: вид → назначение файла школы; вернёт fileId. */
export type BlockUpload = (
	file: File,
	opts: { kind: BlockMediaKind; onProgress: (percent: number) => void },
) => Promise<string>
