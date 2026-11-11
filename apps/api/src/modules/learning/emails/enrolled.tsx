// Письмо ученику «вас записали на курс» (карточка 4.1, скилл notifications): название курса и ссылка на курс.
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const enrolledEmail = defineEmail({
	key: 'learning.enrolled',
	schema: z.object({ courseTitle: z.string(), url: z.url() }),
	subject: (d, t, school) => t('emails:enrolled.subject', { school: school.name, course: d.courseTitle }),
	Component: ({ data, t, school }) => {
		const vars = { school: school.name, course: data.courseTitle }
		return (
			<EmailLayout school={school} preview={t('emails:enrolled.preview', vars)}>
				<Text>{t('emails:enrolled.body', vars)}</Text>
				<EmailButton href={data.url}>{t('emails:enrolled.cta')}</EmailButton>
			</EmailLayout>
		)
	},
	examples: [{ courseTitle: 'Основы акварели', url: 'http://demo.dinastia.localhost:5173/learn/courses/пример' }],
})
