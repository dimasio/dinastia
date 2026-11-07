// Фейковый провайдер видео (скилл integrations: фейк обязателен) — без сети и ключей, вне production.
// Id содержит время создания: через FAKE_PROCESSING_MS видео «обработано»; имя файла с «broken» — ошибка обработки.
import { randomUUID } from 'node:crypto'
import type { VideoProvider } from './provider.ts'

export const FAKE_PROCESSING_MS = 3000
export const FAKE_UPLOAD_PREFIX = 'fake://'

export const fakeVideo: VideoProvider = {
	key: 'fake',
	async createUpload(_http, { filename, now }) {
		const videoId = `fake-${filename.includes('broken') ? 'bad' : 'ok'}-${now.getTime()}-${randomUUID().slice(0, 8)}`
		return { videoId, uploadUrl: `${FAKE_UPLOAD_PREFIX}${videoId}` }
	},
	async getStatus(_http, videoId, now) {
		const m = /^fake-(ok|bad)-(\d+)-/.exec(videoId)
		if (!m) return 'failed'
		if (now.getTime() - Number(m[2]) < FAKE_PROCESSING_MS) return 'processing'
		return m[1] === 'bad' ? 'failed' : 'ready'
	},
}
