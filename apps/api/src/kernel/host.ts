/**
 * Школа по хосту запроса (architecture §3): `<slug>.<APP_DOMAIN>` → slug; корневой домен → `root`; иначе — `unknown`
 * (свои домены школ — R5, таблица school_domains).
 */
export type HostTarget = { kind: 'root' } | { kind: 'school'; slug: string } | { kind: 'unknown' }

export function resolveHost(hostHeader: string | undefined, appDomain: string): HostTarget {
	if (!hostHeader) return { kind: 'unknown' }
	const host = hostHeader.toLowerCase().replace(/:\d+$/, '')
	const domain = appDomain.toLowerCase()
	if (host === domain) return { kind: 'root' }
	if (!host.endsWith(`.${domain}`)) return { kind: 'unknown' }
	const sub = host.slice(0, -(domain.length + 1))
	if (sub.includes('.') || !/^[a-z0-9-]+$/.test(sub)) return { kind: 'unknown' }
	return { kind: 'school', slug: sub }
}
