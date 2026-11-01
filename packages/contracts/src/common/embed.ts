// Белый список встраиваний (скилл security-baseline): блоки «Встраивание» и «Видео» принимают только эти сервисы,
// только https; рендер — в iframe sandbox по адресу из embedSrc (ссылка как есть в iframe не попадает). Новый
// сервис — с согласия человека (список согласован 2026-10-31). Общий для api и web: схема блока проверяет ссылку.

// URL есть и в браузере, и в Node, но пакет собирается без типов DOM и Node — объявление только для этого модуля
declare const URL: new (
	url: string,
) => {
	protocol: string
	username: string
	password: string
	port: string
	hostname: string
	pathname: string
	searchParams: { get(name: string): string | null }
}

export interface EmbedService {
	key: string
	/** Хост целиком или его поддомены (`youtube.com` → `www.youtube.com`, `m.youtube.com`). */
	hosts: readonly string[]
	/** Если задано — путь должен начинаться с одного из префиксов (Google — только формы). */
	paths?: readonly string[]
}

export const EMBED_SERVICES: readonly EmbedService[] = [
	{ key: 'youtube', hosts: ['youtube.com', 'youtube-nocookie.com', 'youtu.be'] },
	{ key: 'rutube', hosts: ['rutube.ru'] },
	{ key: 'vk-video', hosts: ['vkvideo.ru', 'vk.com', 'vk.ru'], paths: ['/video', '/clip', '/embed', '/video_ext.php'] },
	{ key: 'kinescope', hosts: ['kinescope.io'] },
	{ key: 'vimeo', hosts: ['vimeo.com'] },
	{ key: 'yandex-forms', hosts: ['forms.yandex.ru'] },
	{ key: 'google-forms', hosts: ['docs.google.com'], paths: ['/forms/'] },
	{ key: 'google-forms', hosts: ['forms.gle'] },
]

const hostMatches = (host: string, allowed: string) => host === allowed || host.endsWith(`.${allowed}`)

/** Сервис встраивания по ссылке; null — ссылку встраивать нельзя. */
export function embedService(raw: string): string | null {
	let url: InstanceType<typeof URL>
	try {
		url = new URL(raw)
	} catch {
		return null
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
	const host = url.hostname.toLowerCase()
	const service = EMBED_SERVICES.find(
		(s) => s.hosts.some((h) => hostMatches(host, h)) && (!s.paths || s.paths.some((p) => url.pathname.startsWith(p))),
	)
	return service?.key ?? null
}

export const isAllowedEmbed = (url: string): boolean => embedService(url) !== null

/** Видеосервисы — для блока «Видео» (остальные из списка — только «Встраивание»). */
export const VIDEO_SERVICES = ['youtube', 'rutube', 'vk-video', 'kinescope', 'vimeo'] as const

const YOUTUBE_ID = /^[\w-]{11}$/

/**
 * Адрес для iframe по ссылке из белого списка: страница видео → адрес плеера сервиса. null — встроить нельзя
 * (сервис не из списка или ссылку не разобрать, например сокращённая forms.gle).
 */
export function embedSrc(raw: string): string | null {
	const service = embedService(raw)
	if (!service) return null
	const url = new URL(raw)
	const parts = url.pathname.split('/').filter(Boolean)
	switch (service) {
		case 'youtube': {
			const id = url.hostname.endsWith('youtu.be')
				? parts[0]
				: parts[0] === 'watch'
					? url.searchParams.get('v')
					: ['embed', 'shorts', 'live'].includes(parts[0] ?? '')
						? parts[1]
						: null
			return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
		}
		case 'rutube': {
			// /video/<id>/, /play/embed/<id>, /shorts/<id>
			const id = parts[0] === 'play' ? parts[2] : parts[1]
			return id && /^[\w]+$/.test(id) ? `https://rutube.ru/play/embed/${id}` : null
		}
		case 'vk-video': {
			if (parts[0] === 'video_ext.php') {
				const oid = url.searchParams.get('oid')
				const id = url.searchParams.get('id')
				const hash = url.searchParams.get('hash')
				if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) return null
				return `https://vkvideo.ru/video_ext.php?oid=${oid}&id=${id}${hash && /^\w+$/.test(hash) ? `&hash=${hash}` : ''}`
			}
			const m = /^(?:video|clip)(-?\d+)_(\d+)$/.exec(parts.at(-1) ?? '')
			return m ? `https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}` : null
		}
		case 'kinescope': {
			const id = parts[0] === 'embed' ? parts[1] : parts[0]
			return id && /^[\w-]+$/.test(id) ? `https://kinescope.io/embed/${id}` : null
		}
		case 'vimeo': {
			const id = parts.at(-1)
			return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
		}
		case 'yandex-forms': {
			const id = parts[0] === 'u' ? parts[1] : null
			return id && /^[\w-]+$/.test(id) ? `https://forms.yandex.ru/u/${id}/?iframe=1` : null
		}
		case 'google-forms': {
			// только полная ссылка docs.google.com/forms/d/<id>/… (forms.gle — переадресация, встроить нельзя)
			const i = parts.indexOf('d')
			if (url.hostname !== 'docs.google.com' || i < 0) return null
			const id = parts[i + 1] === 'e' ? `e/${parts[i + 2] ?? ''}` : parts[i + 1]
			return id && /^(?:e\/)?[\w-]+$/.test(id) ? `https://docs.google.com/forms/d/${id}/viewform?embedded=true` : null
		}
		default:
			return null
	}
}

/** Можно встроить блоком «Видео»: видеосервис и ссылка разбирается. */
export const isVideoUrl = (url: string): boolean =>
	(VIDEO_SERVICES as readonly string[]).includes(embedService(url) ?? '') && embedSrc(url) !== null
