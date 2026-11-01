import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** Картинка: файл школы (JPEG, PNG, WebP, GIF), описание для незрячих и подпись. Ссылку на файл выдаёт сервер. */
export const image = defineBlock({
	type: 'image',
	category: 'media',
	schema: z.object({
		fileId: z.uuid().nullish(),
		alt: z.string().trim().max(300).nullish(),
		caption: z.string().trim().max(300).nullish(),
	}),
	defaults: () => ({ fileId: null, alt: null, caption: null }),
	completion: 'none',
	files: (d) => (d.fileId ? [d.fileId] : []),
	issues: { noFile: (d) => !d.fileId },
})
