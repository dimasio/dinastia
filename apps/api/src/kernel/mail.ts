// Отправка писем (временная простая версия до 1.8: defineEmail + React Email + очередь). Скилл notifications.
import nodemailer from 'nodemailer'
import { config } from './config.ts'

export interface Mail {
	to: string
	subject: string
	text: string
	html?: string
}

/** Письма, «отправленные» при MAIL_TRANSPORT=memory (тесты). */
export const memoryOutbox: Mail[] = []

const transport =
	config.MAIL_TRANSPORT === 'smtp'
		? nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: false })
		: null

export async function sendMail(mail: Mail): Promise<void> {
	if (!transport) {
		memoryOutbox.push(mail)
		return
	}
	await transport.sendMail({ from: config.SMTP_FROM, ...mail })
}
