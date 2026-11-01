import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Файл для скачивания: PDF, офисные документы, архив, текст, аудио; название — по умолчанию имя файла. */
export const file = defineBlock({
	type: 'file',
	category: 'media',
	schema: z.object({
		fileId: z.uuid().nullish(),
		title: z.string().trim().max(200).nullish(),
	}),
	defaults: () => ({ fileId: null, title: null }),
	completion: 'none',
	files: (d) => (d.fileId ? [d.fileId] : []),
	issues: { noFile: (d) => !d.fileId },
})
