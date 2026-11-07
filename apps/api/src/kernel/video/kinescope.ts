// Kinescope (D-011): токен платформы в env. Загрузка — POST uploader.kinescope.io/v2/init → клиент грузит по tus в
// `data.endpoint`; статус — GET api.kinescope.io/v1/videos/{id}. Ответы разбираются zod (формат сервиса может поменяться).
import { z } from 'zod'
import { config } from '../config.ts'
import { type Http, HttpError } from '../http.ts'
import { ProviderError, type VideoProvider, type VideoStatus } from './provider.ts'

const Init = z.object({ data: z.object({ id: z.string().min(1), endpoint: z.url() }) })
const Details = z.object({ data: z.object({ status: z.string() }) })

const headers = () => {
	if (!config.KINESCOPE_TOKEN) throw new ProviderError('kinescope', 'KINESCOPE_TOKEN не задан')
	return { authorization: `Bearer ${config.KINESCOPE_TOKEN}`, 'content-type': 'application/json' }
}

/** Сеть и 5xx — временные; остальное — нет. */
async function call(http: Http, url: string, req: Parameters<Http['request']>[1]) {
	try {
		const res = await http.request(url, { timeoutMs: 5_000, ...req })
		if (res.status >= 400)
			throw new ProviderError('kinescope', `HTTP ${res.status}`, res.status >= 500 || res.status === 429)
		return res.json()
	} catch (e) {
		if (e instanceof ProviderError) throw e
		throw new ProviderError('kinescope', 'запрос не удался', e instanceof HttpError ? e.retryable : false)
	}
}

/** Статусы Kinescope: `done` — готово, `error`/`aborted` — сбой, остальное (uploading, pre-processing, processing…) — в работе. */
export const kinescopeStatus = (s: string): VideoStatus =>
	s === 'done' ? 'ready' : s === 'error' || s === 'aborted' ? 'failed' : 'processing'

export const kinescopeVideo: VideoProvider = {
	key: 'kinescope',
	async createUpload(http, { filename, size }) {
		if (!config.KINESCOPE_PROJECT_ID) throw new ProviderError('kinescope', 'KINESCOPE_PROJECT_ID не задан')
		const json = await call(http, 'https://uploader.kinescope.io/v2/init', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({
				parent_id: config.KINESCOPE_PROJECT_ID,
				type: 'video',
				filename,
				title: filename,
				filesize: size,
			}),
		})
		const parsed = Init.safeParse(json)
		if (!parsed.success) throw new ProviderError('kinescope', 'неожиданный ответ init')
		return { videoId: parsed.data.data.id, uploadUrl: parsed.data.data.endpoint }
	},
	async getStatus(http, videoId) {
		const json = await call(http, `https://api.kinescope.io/v1/videos/${encodeURIComponent(videoId)}`, {
			headers: headers(),
		})
		const parsed = Details.safeParse(json)
		if (!parsed.success) throw new ProviderError('kinescope', 'неожиданный ответ videos')
		return kinescopeStatus(parsed.data.data.status)
	},
}
