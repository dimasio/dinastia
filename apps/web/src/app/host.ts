// Где открыт кабинет: корневой домен или поддомен школы (тот же алгоритм, что на сервере — kernel/host.ts).
export type HostTarget = { kind: 'root' } | { kind: 'school'; slug: string } | { kind: 'unknown' }

export function currentHost(hostname = window.location.hostname): HostTarget {
	const domain = import.meta.env.VITE_APP_DOMAIN.toLowerCase()
	const host = hostname.toLowerCase()
	if (host === domain) return { kind: 'root' }
	if (!host.endsWith(`.${domain}`)) return { kind: 'unknown' }
	const sub = host.slice(0, -(domain.length + 1))
	return sub.includes('.') ? { kind: 'unknown' } : { kind: 'school', slug: sub }
}

/** Адрес корня или школы с текущими протоколом и портом. */
export function hostUrl(slug?: string, path = '/') {
	const { protocol, port } = window.location
	const domain = import.meta.env.VITE_APP_DOMAIN
	return `${protocol}//${slug ? `${slug}.` : ''}${domain}${port ? `:${port}` : ''}${path}`
}
