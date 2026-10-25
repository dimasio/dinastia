// Загрузка файла (скилл files-media): createUpload → PUT в S3 напрямую (с прогрессом) → complete. Вернёт fileId.
import { client } from './orpc.ts'

export async function uploadFile(purpose: string, file: File, onProgress: (percent: number) => void) {
	const u = await client.files.createUpload({ purpose, name: file.name, mime: file.type, size: file.size })
	await new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open('PUT', u.uploadUrl)
		for (const [k, v] of Object.entries(u.headers)) xhr.setRequestHeader(k, v)
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
		xhr.onload = () =>
			xhr.status < 300 ? resolve() : reject(Object.assign(new Error('upload'), { code: 'FILE_NOT_UPLOADED' }))
		xhr.onerror = () => reject(new TypeError('network'))
		xhr.send(file)
	})
	return (await client.files.complete({ id: u.fileId })).id
}
