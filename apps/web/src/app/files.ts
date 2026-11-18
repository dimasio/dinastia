// Загрузка файла (скилл files-media): createUpload → PUT в S3 напрямую (с прогрессом) → complete. Вернёт fileId.
import { fileMime } from '@dinastia/contracts/common'
import { client } from './orpc.ts'

export async function uploadFile(purpose: string, file: File, onProgress: (percent: number) => void) {
	const u = await client.files.createUpload({ purpose, name: file.name, mime: fileMime(file), size: file.size })
	await putFile(u.uploadUrl, u.headers, file, onProgress)
	return (await client.files.complete({ id: u.fileId })).id
}

/** PUT файла на presigned URL хранилища с прогрессом. */
export function putFile(
	url: string,
	headers: Record<string, string>,
	file: File,
	onProgress: (percent: number) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open('PUT', url)
		for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
		xhr.onload = () =>
			xhr.status < 300 ? resolve() : reject(Object.assign(new Error('upload'), { code: 'FILE_NOT_UPLOADED' }))
		xhr.onerror = () => reject(new TypeError('network'))
		xhr.send(file)
	})
}
