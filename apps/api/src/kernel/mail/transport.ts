// Транспорт писем (D-012): SMTP (локально Mailpit) или память (тесты). Шаблоны и очередь — define.ts, send.ts.
import nodemailer from 'nodemailer'
import { config } from '../config.ts'

export interface Mail {
	to: string
	subject: string
	text: string
	html?: string
	/** Имя отправителя (название школы); адрес — из SMTP_FROM. */
	fromName?: string
}

/** Письма, «отправленные» при MAIL_TRANSPORT=memory (тесты). */
export const memoryOutbox: Mail[] = []

const transport =
	config.MAIL_TRANSPORT === 'smtp'
		? nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: false })
		: null

/** Адрес из SMTP_FROM («Dinastia <noreply@…>» → noreply@…). */
const fromAddress = config.SMTP_FROM.match(/<([^>]+)>/)?.[1] ?? config.SMTP_FROM

export async function sendMail(mail: Mail): Promise<void> {
	if (!transport) {
		memoryOutbox.push(mail)
		return
	}
	const { fromName, ...rest } = mail
	await transport.sendMail({ ...rest, from: fromName ? { name: fromName, address: fromAddress } : config.SMTP_FROM })
}
