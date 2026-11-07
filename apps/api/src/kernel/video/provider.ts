// Провайдер видео (скилл integrations, D-011): модули не знают, какой сервис подключён. Загрузка — клиент шлёт файл
// напрямую провайдеру (tus), мимо нашего сервера; статус — опросом (подпись вебхука Kinescope не подтверждена, 2.4b).
import type { Http } from '../http.ts'

export type VideoStatus = 'processing' | 'ready' | 'failed'

export class ProviderError extends Error {
	constructor(
		readonly provider: string,
		message: string,
		/** Сбой временный (сеть, 5xx) — задачу можно повторить. */
		readonly retryable = false,
	) {
		super(message)
		this.name = 'ProviderError'
	}
}

export interface VideoProvider {
	readonly key: 'kinescope' | 'fake'
	/** Создать загрузку: id видео у провайдера и адрес tus, куда клиент шлёт файл. */
	createUpload(
		http: Http,
		input: { filename: string; size: number; now: Date },
	): Promise<{ videoId: string; uploadUrl: string }>
	getStatus(http: Http, videoId: string, now: Date): Promise<VideoStatus>
}

/** `ctx.video`: провайдер, привязанный к исходящим вызовам контекста. */
export interface Video {
	readonly key: VideoProvider['key']
	createUpload(input: { filename: string; size: number }): Promise<{ videoId: string; uploadUrl: string }>
	getStatus(videoId: string): Promise<VideoStatus>
}

export function videoFor(provider: VideoProvider, http: Http, now: () => Date): Video {
	return {
		key: provider.key,
		createUpload: (input) => provider.createUpload(http, { ...input, now: now() }),
		getStatus: (videoId) => provider.getStatus(http, videoId, now()),
	}
}
