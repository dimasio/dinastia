// Письмо «вход по ссылке» (карточка 4.8, скилл notifications): шаблон в общем виде, тема с названием школы — на сайте школы,
// с Dinastia — на корне. Ссылка содержит токен: письмо рендерится и уходит сразу из обработчика better-auth, в очередь не ложится.
import { schools } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import { Text } from 'react-email'
import { z } from 'zod'
import { config } from '../config.ts'
import { db } from '../db/client.ts'
import { resolveHost } from '../host.ts'
import { defineEmail, EmailButton, EmailLayout, EmailNote, type EmailSchool } from '../mail/define.tsx'
import { deliverEmail } from '../mail/send.ts'

/** Отправитель писем платформы (не школы): вход с корневого домена. */
export const PLATFORM: EmailSchool = { name: 'Dinastia', slug: '' }

export const magicLinkEmail = defineEmail({
	key: 'auth.magic-link',
	schema: z.object({ url: z.url() }),
	subject: (_d, t, school) => t('emails:magicLink.subject', { school: school.name }),
	Component: ({ data, t, school }) => (
		<EmailLayout school={school} preview={t('emails:magicLink.preview', { school: school.name })}>
			<Text>{t('emails:magicLink.body', { school: school.name })}</Text>
			<EmailButton href={data.url}>{t('emails:magicLink.cta')}</EmailButton>
			<EmailNote>{t('emails:magicLink.expires')}</EmailNote>
			<EmailNote>{t('emails:magicLink.ignore')}</EmailNote>
		</EmailLayout>
	),
	examples: [
		{ url: 'http://demo.dinastia.localhost:5173/api/auth/magic-link/verify?token=пример&callbackURL=%2Flearn' },
	],
})

/** Школа по хосту ссылки (better-auth строит её от хоста запроса); корень, чужой хост или неактивная школа — платформа. */
async function senderOf(url: string): Promise<EmailSchool> {
	const host = resolveHost(new URL(url).host, config.APP_DOMAIN)
	if (host.kind !== 'school') return PLATFORM
	const [row] = await db.select().from(schools).where(eq(schools.slug, host.slug)).limit(1)
	return row?.status === 'active' ? { name: row.name, slug: row.slug } : PLATFORM
}

export async function sendMagicLinkEmail(to: string, url: string) {
	await deliverEmail(await senderOf(url), magicLinkEmail, { to, data: { url } })
}
