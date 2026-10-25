// Письмо-приглашение сотрудника (скилл notifications). Ссылка с токеном — секрет: письмо рендерит и отправляет задача
// schools.send-invitation (deliverEmail), а не ctx.mail.send — иначе токен лёг бы в очередь.
import { formatDate } from '@dinastia/i18n'
import { Button, Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailLayout } from '#/kernel/mail/define.tsx'

export const invitationEmail = defineEmail({
	key: 'schools.invitation',
	schema: z.object({
		inviterName: z.string(),
		role: z.enum(['admin', 'teacher', 'curator']),
		url: z.url(),
		expiresAt: z.coerce.date(),
	}),
	subject: (_d, t, school) => t('emails:invitation.subject', { school: school.name }),
	Component: ({ data, t, school }) => {
		const vars = {
			inviter: data.inviterName,
			school: school.name,
			role: t(`common:roles.${data.role}`),
			date: formatDate(data.expiresAt, 'Europe/Moscow'), // часовой пояс школы — с настройками школы
		}
		return (
			<EmailLayout school={school} preview={t('emails:invitation.preview', vars)}>
				<Text>{t('emails:invitation.body', vars)}</Text>
				<Button
					href={data.url}
					style={{ backgroundColor: '#171717', borderRadius: 6, color: '#ffffff', padding: '12px 20px' }}
				>
					{t('emails:invitation.cta')}
				</Button>
				<Text style={{ color: '#737373', fontSize: 13 }}>{t('emails:invitation.expires', vars)}</Text>
				<Text style={{ color: '#737373', fontSize: 13 }}>{t('emails:invitation.ignore')}</Text>
			</EmailLayout>
		)
	},
	examples: [
		{
			inviterName: 'Ольга Владелец',
			role: 'teacher',
			url: 'http://demo.dinastia.localhost:5173/invite/пример-токена',
			expiresAt: new Date('2026-11-01'),
		},
	],
})
