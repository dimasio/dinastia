// Письмо ученику «открылись новые уроки» (карточка 4.8): уроки курса, открывшиеся по расписанию, — одним письмом на курс.
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const lessonsOpenedEmail = defineEmail({
	key: 'learning.lessons-opened',
	schema: z.object({ courseTitle: z.string(), lessons: z.array(z.string()).min(1), url: z.url() }),
	subject: (d, t, school) => t('emails:lessonsOpened.subject', { school: school.name, course: d.courseTitle }),
	Component: ({ data, t, school }) => {
		const vars = { school: school.name, course: data.courseTitle }
		return (
			<EmailLayout school={school} preview={t('emails:lessonsOpened.preview', { count: data.lessons.length })}>
				<Text>{t('emails:lessonsOpened.body', vars)}</Text>
				{data.lessons.map((title, i) => (
					// названия могут повторяться — ключ по месту в списке
					<Text key={i} style={{ margin: '4px 0', paddingLeft: 12 }}>
						• {title}
					</Text>
				))}
				<EmailButton href={data.url}>{t('emails:lessonsOpened.cta')}</EmailButton>
			</EmailLayout>
		)
	},
	examples: [
		{
			courseTitle: 'Пожарная безопасность',
			lessons: ['Первичные средства пожаротушения', 'Действия при пожаре'],
			url: 'http://demo.dinastia.localhost:5173/learn/courses/пример',
		},
		{
			courseTitle: 'Основы акварели',
			lessons: ['Свет и тень'],
			url: 'http://demo.dinastia.localhost:5173/learn/courses/пример',
		},
	],
})
