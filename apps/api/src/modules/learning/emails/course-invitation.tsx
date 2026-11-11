// Письмо-приглашение на курс (скилл notifications). Ссылка с токеном — секрет: письмо рендерит и отправляет задача
// learning.send-course-invitation (deliverEmail), а не ctx.mail.send — иначе токен лёг бы в очередь.
import { formatDate } from '@dinastia/i18n'
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout, EmailNote } from '#/kernel/mail/define.tsx'

export const courseInvitationEmail = defineEmail({
	key: 'learning.course-invitation',
	schema: z.object({ inviterName: z.string(), courseTitle: z.string(), url: z.url(), expiresAt: z.coerce.date() }),
	subject: (d, t, school) => t('emails:courseInvitation.subject', { school: school.name, course: d.courseTitle }),
	Component: ({ data, t, school }) => {
		const vars = {
			inviter: data.inviterName,
			school: school.name,
			course: data.courseTitle,
			date: formatDate(data.expiresAt, 'Europe/Moscow'),
		}
		return (
			<EmailLayout school={school} preview={t('emails:courseInvitation.preview', vars)}>
				<Text>{t('emails:courseInvitation.body', vars)}</Text>
				<EmailButton href={data.url}>{t('emails:courseInvitation.cta')}</EmailButton>
				<EmailNote>{t('emails:courseInvitation.expires', vars)}</EmailNote>
				<EmailNote>{t('emails:courseInvitation.ignore')}</EmailNote>
			</EmailLayout>
		)
	},
	examples: [
		{
			inviterName: 'Ольга Владелец',
			courseTitle: 'Основы акварели',
			url: 'http://demo.dinastia.localhost:5173/join/пример-токена',
			expiresAt: new Date('2026-11-15'),
		},
	],
})
