// Письмо ученику «сертификат готов» (карточка 4.8, скилл notifications): номер и ссылка на страницу курса — там «Скачать
// сертификат». PDF не вкладывается: файл с ПДн не уходит в почтовые ящики.
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const certificateIssuedEmail = defineEmail({
	key: 'certificates.issued',
	schema: z.object({ courseTitle: z.string(), number: z.string(), url: z.url() }),
	subject: (d, t, school) => t('emails:certificateIssued.subject', { school: school.name, course: d.courseTitle }),
	Component: ({ data, t, school }) => {
		const vars = { school: school.name, course: data.courseTitle, number: data.number }
		return (
			<EmailLayout school={school} preview={t('emails:certificateIssued.preview', vars)}>
				<Text>{t('emails:certificateIssued.body', vars)}</Text>
				<EmailButton href={data.url}>{t('emails:certificateIssued.cta')}</EmailButton>
			</EmailLayout>
		)
	},
	examples: [
		{
			courseTitle: 'Пожарная безопасность',
			number: 'DEMO-2026-000001',
			url: 'http://demo.dinastia.localhost:5173/learn/courses/пример',
		},
	],
})
