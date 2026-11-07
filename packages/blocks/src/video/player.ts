/** Видео, загруженное в сервис (карточка 2.4b): сервис и статус обработки. Статус и id пишет только сервер. */
export const VIDEO_SOURCES = ['link', 'upload'] as const
export const VIDEO_PROVIDERS = ['kinescope', 'fake'] as const
export const VIDEO_STATUSES = ['processing', 'ready', 'failed'] as const

/** Адрес плеера загруженного видео — его получает ученик (не токен и не исходный адрес). */
export function videoPlayerSrc(provider: string, videoId: string): string | null {
	if (provider === 'kinescope') return `https://kinescope.io/embed/${encodeURIComponent(videoId)}`
	if (provider === 'fake') return `about:blank#${encodeURIComponent(videoId)}`
	return null
}
