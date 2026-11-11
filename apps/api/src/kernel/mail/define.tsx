// Шаблоны писем (скилл notifications, D-012): defineEmail в modules/<m>/emails/*.tsx — React Email, тема и тексты
// из i18n (namespace emails), макет с названием школы. Рендер — HTML и текстовая версия.
import { createI18n } from '@dinastia/i18n'
import { render, toPlainText } from '@react-email/render'
import type { ComponentType, ReactNode } from 'react'
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email'
import type { z } from 'zod'

export type T = (key: string, options?: Record<string, unknown>) => string
export interface EmailSchool {
	name: string
	slug: string
}

export interface EmailDef<D = unknown> {
	/** `<модуль>.<письмо>` (kebab-case), неизменяемо. */
	key: string
	schema: z.ZodType<D>
	subject: (data: D, t: T, school: EmailSchool) => string
	Component: ComponentType<{ data: D; t: T; school: EmailSchool }>
	/** Примеры данных для предпросмотра (`pnpm emails:preview`) и теста рендера. */
	examples: D[]
}

/** Письмо с любыми данными — для реестра (у каждого своя схема). */
// biome-ignore lint/suspicious/noExplicitAny: вариантность: EmailDef<{ url }> должен попадать в общий список
export type AnyEmail = EmailDef<any>

export const EMAIL_KEY = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/

export function defineEmail<D>(def: EmailDef<D>): EmailDef<D> {
	if (!EMAIL_KEY.test(def.key)) throw new Error(`письмо «${def.key}»: ключ — <модуль>.<письмо> в kebab-case`)
	return def
}

const i18n = createI18n('ru', { markMissing: process.env.NODE_ENV !== 'production' })
export const t: T = (key, options) => (i18n.t as unknown as T)(key, options)

/** Макет письма: название школы сверху, подвал — почему пришло письмо. */
export function EmailLayout({
	school,
	preview,
	children,
}: {
	school: EmailSchool
	preview: string
	children: ReactNode
}) {
	return (
		<Html lang="ru">
			<Head />
			<Preview>{preview}</Preview>
			<Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0 }}>
				<Container style={{ backgroundColor: '#ffffff', margin: '24px auto', maxWidth: 560, padding: 32 }}>
					<Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 24px' }}>{school.name}</Text>
					<Section>{children}</Section>
					<Hr style={{ borderColor: '#e5e5e5', margin: '32px 0 16px' }} />
					<Text style={{ color: '#737373', fontSize: 12, margin: 0 }}>
						{/* письмо платформы (вход с корневого домена) — без школы */}
						{school.slug ? t('emails:layout.footer', { school: school.name }) : t('emails:layout.footerPlatform')}
					</Text>
				</Container>
			</Body>
		</Html>
	)
}

/** Главное действие письма — одна кнопка во всех письмах (4.8). */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Button
			href={href}
			style={{ backgroundColor: '#171717', borderRadius: 6, color: '#ffffff', margin: '8px 0', padding: '12px 20px' }}
		>
			{children}
		</Button>
	)
}

/** Мелкий текст под кнопкой: срок ссылки, «если вы не ждали письма». */
export function EmailNote({ children }: { children: ReactNode }) {
	return <Text style={{ color: '#737373', fontSize: 13 }}>{children}</Text>
}

/** Цитата: комментарий проверяющего. */
export function EmailQuote({ children }: { children: ReactNode }) {
	return (
		<Text style={{ borderLeft: '3px solid #d4d4d4', color: '#404040', margin: '12px 0', padding: '4px 12px' }}>
			{children}
		</Text>
	)
}

/** Тема, HTML и текст письма; данные проверяются схемой. */
export async function renderEmail<D>(email: EmailDef<D>, data: D, school: EmailSchool) {
	const parsed = email.schema.parse(data)
	const { Component } = email
	const html = await render(<Component data={parsed} t={t} school={school} />)
	return { subject: email.subject(parsed, t, school), html, text: toPlainText(html) }
}
