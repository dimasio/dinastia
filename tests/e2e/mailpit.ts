// Письма из Mailpit (скилл local-env): дождаться письма на адрес и достать ссылку.
import { E2E_MAILPIT } from './env.ts'

const MAILPIT = `${E2E_MAILPIT}/api/v1`

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

export type Mail = { subject: string; text: string; html: string }

/** Дождаться письма на адрес, тема которого подходит под `subject`; вернуть тему, текст и HTML. */
export async function waitForMail(to: string, subject: RegExp, timeoutMs = 15_000): Promise<Mail> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)
		const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
		const hit = messages.find((m) => subject.test(m.Subject))
		if (hit) {
			const msg = (await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json()) as { Text: string; HTML: string }
			return { subject: hit.Subject, text: msg.Text, html: msg.HTML }
		}
		await new Promise((r) => setTimeout(r, 300))
	}
	throw new Error(`нет письма «${subject}» для ${to}`)
}
