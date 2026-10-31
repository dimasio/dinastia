// Белый список встраиваний (скилл security-baseline): блок embed и видео по ссылке принимают только эти сервисы,
// только https; рендер — в iframe sandbox. Новый сервис — с согласия человека (список согласован 2026-10-31).

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
	let url: URL
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
