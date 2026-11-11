// Политика безопасности контента веба (5.1, скилл security-baseline). Один источник: dev-сервер Vite отдаёт её с каждой страницей
// (весь e2e-набор идёт под ней), в 5.3 тот же текст ставит веб-сервер перед статикой. Встраивания — только сервисы из белого
// списка блоков; файлы — подписанные ссылки хранилища S3.
import { EMBED_SERVICES } from '@dinastia/contracts/common'

export interface CspOptions {
	/** Origin хранилища файлов (картинки, видео, загрузка по presigned URL). */
	s3Origin: string
	/** Dev-сервер Vite: встроенный скрипт React Refresh и HMR по WebSocket. */
	dev: boolean
}

export function contentSecurityPolicy({ s3Origin, dev }: CspOptions): string {
	const frames = [...new Set(EMBED_SERVICES.flatMap((s) => s.hosts))].flatMap((h) => [`https://${h}`, `https://*.${h}`])
	const directives: Record<string, string[]> = {
		'default-src': ["'self'"],
		'script-src': ["'self'", ...(dev ? ["'unsafe-inline'"] : [])],
		// Radix, Tiptap и вёрстка сертификата задают инлайн-стили
		'style-src': ["'self'", "'unsafe-inline'"],
		'img-src': ["'self'", 'data:', 'blob:', s3Origin],
		'media-src': ["'self'", 'blob:', s3Origin],
		'font-src': ["'self'", 'data:'],
		'connect-src': ["'self'", s3Origin, ...(dev ? ['ws:', 'wss:'] : [])],
		'frame-src': ["'self'", ...frames],
		'frame-ancestors': ["'none'"],
		'object-src': ["'none'"],
		'base-uri': ["'self'"],
		'form-action': ["'self'"],
	}
	return Object.entries(directives)
		.map(([k, v]) => `${k} ${v.join(' ')}`)
		.join('; ')
}
