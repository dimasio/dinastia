// Файлы (скилл files-media): загрузка напрямую в S3 по presigned URL — createUpload → PUT → complete.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { Id } from './common/index.ts'

export const FileUploadInput = z.object({
	/** Назначение (`defineFilePurpose` на сервере): лимиты, типы, право. */
	purpose: z.string().max(60),
	name: z.string().trim().min(1).max(200),
	mime: z.string().max(100),
	size: z.number().int().positive(),
})
export type FileUploadInput = z.infer<typeof FileUploadInput>

export const FileUpload = z.object({
	fileId: Id,
	/** PUT сюда тело файла с заголовками `headers` (ссылка живёт 15 минут). */
	uploadUrl: z.url(),
	headers: z.record(z.string(), z.string()),
})
export type FileUpload = z.infer<typeof FileUpload>

export const FileInfo = z.object({ id: Id, name: z.string(), mime: z.string(), size: z.number().int() })
export type FileInfo = z.infer<typeof FileInfo>

export const filesContract = {
	/** Начать загрузку: ссылка на PUT. Лимит размера и тип — по назначению (400 FILE_TOO_LARGE / FILE_TYPE_NOT_ALLOWED). */
	createUpload: oc
		.route({ method: 'POST', path: '/school/files', successStatus: 201 })
		.input(FileUploadInput)
		.output(FileUpload),
	/** Подтвердить загрузку: сервер сверяет объект в S3 (размер, тип). */
	complete: oc
		.route({ method: 'POST', path: '/school/files/{id}/complete' })
		.input(z.object({ id: Id }))
		.output(FileInfo),
}
