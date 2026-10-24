// Письма из Mailpit (скилл local-env): дождаться письма на адрес и достать ссылку.
const MAILPIT = 'http://localhost:8025/api/v1'

export async function waitForLink(to: string, pattern: RegExp, timeoutMs = 10_000): Promise<string> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)
		const { messages } = (await res.json()) as { messages: { ID: string }[] }
		for (const m of messages) {
			const msg = (await (await fetch(`${MAILPIT}/message/${m.ID}`)).json()) as { Text: string }
			const link = msg.Text.match(pattern)?.[0]
			if (link) return link
		}
		await new Promise((r) => setTimeout(r, 300))
	}
	throw new Error(`нет письма со ссылкой ${pattern} для ${to}`)
}
