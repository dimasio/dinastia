// Загрузка видео напрямую провайдеру по протоколу tus (карточка 2.4b): файл идёт мимо нашего сервера. Адрес
// (`uploadUrl`) выдаёт `courses.blocks.startVideoUpload`. Файл режется на части; при сбое сети — повтор с сервера
// узнанного смещения (HEAD). Фейковый провайдер (`fake://`, только вне production) сети не трогает.
const CHUNK = 8 * 1024 * 1024
const ATTEMPTS = 3
const TUS = { 'Tus-Resumable': '1.0.0' }

function send(
	method: 'HEAD' | 'PATCH',
	url: string,
	headers: Record<string, string>,
	body?: Blob,
	onBytes?: (n: number) => void,
) {
	return new Promise<number>((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open(method, url)
		for (const [k, v] of Object.entries({ ...TUS, ...headers })) xhr.setRequestHeader(k, v)
		xhr.upload.onprogress = (e) => e.lengthComputable && onBytes?.(e.loaded)
		xhr.onload = () => {
			if (xhr.status >= 300) return reject(Object.assign(new Error('upload'), { code: 'VIDEO_NOT_UPLOADED' }))
			resolve(Number(xhr.getResponseHeader('Upload-Offset') ?? 0))
		}
		xhr.onerror = () => reject(new TypeError('network'))
		xhr.send(body ?? null)
	})
}

export async function uploadVideo(uploadUrl: string, file: File, onProgress: (percent: number) => void) {
	if (uploadUrl.startsWith('fake://')) {
		for (const p of [20, 60, 100]) {
			onProgress(p)
			await new Promise((r) => setTimeout(r, 50))
		}
		return
	}
	let offset = 0
	let failures = 0
	while (offset < file.size) {
		const chunk = file.slice(offset, offset + CHUNK)
		try {
			offset = await send(
				'PATCH',
				uploadUrl,
				{ 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
				chunk,
				(n) => onProgress(Math.round(((offset + n) / file.size) * 100)),
			)
			failures = 0
		} catch (e) {
			if (++failures >= ATTEMPTS) throw e
			offset = await send('HEAD', uploadUrl, {}).catch(() => offset)
		}
	}
	onProgress(100)
}
