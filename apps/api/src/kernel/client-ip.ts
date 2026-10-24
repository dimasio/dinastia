/**
 * IP клиента (скилл security-baseline): за `hops` доверенными прокси — элемент X-Forwarded-For на `hops` позиций
 * от конца (левее — то, что прислал сам клиент, ему не верим); без прокси — адрес сокета.
 */
export function resolveClientIp(
	forwardedFor: string | undefined,
	socketIp: string | null,
	hops: number,
): string | null {
	if (hops === 0) return socketIp
	const chain = (forwardedFor ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	return chain[chain.length - hops] ?? socketIp
}

/** Заголовок, в котором ядро передаёт better-auth вычисленный IP (входящий с таким именем всегда перезаписывается). */
export const CLIENT_IP_HEADER = 'x-dinastia-client-ip'
