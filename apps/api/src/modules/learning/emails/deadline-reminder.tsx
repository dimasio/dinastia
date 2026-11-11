// Письмо ученику о сроке сдачи урока (карточка 4.4, скилл notifications): «завтра срок» или «срок прошёл», ссылка на урок.
import { formatDate } from '@dinastia/i18n'
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const deadlineReminderEmail = defineEmail({
	key: 'learning.deadline-reminder',
	schema: z.object({
		kind: z.enum(['soon', 'overdue']),
		courseTitle: z.string(),
		lessonTitle: z.string(),
		dueAt: z.iso.datetime(),
		url: z.url(),
	}),
	subject: (d, t, school) =>
		t(`emails:deadlineReminder.${d.kind}.subject`, { school: school.name, lesson: d.lessonTitle }),
	Component: ({ data, t, school }) => {
		const vars = {
			school: school.name,
			course: data.courseTitle,
			lesson: data.lessonTitle,
			date: formatDate(data.dueAt, 'Europe/Moscow'),
		}
		return (
			<EmailLayout school={school} preview={t(`emails:deadlineReminder.${data.kind}.preview`, vars)}>
				<Text>{t(`emails:deadlineReminder.${data.kind}.body`, vars)}</Text>
				<EmailButton href={data.url}>{t('emails:deadlineReminder.cta')}</EmailButton>
			</EmailLayout>
		)
	},
	examples: [
		{
			kind: 'soon',
			courseTitle: 'Пожарная безопасность для работников организации',
			lessonTitle: 'Практика: средства тушения на вашем этаже',
			dueAt: '2026-11-12T20:59:59.999Z',
			url: 'http://trud.dinastia.localhost:5173/learn/courses/пример/lessons/пример',
		},
		{
			kind: 'overdue',
			courseTitle: 'Пожарная безопасность для работников организации',
			lessonTitle: 'Итоговый тест',
			dueAt: '2026-11-09T20:59:59.999Z',
			url: 'http://trud.dinastia.localhost:5173/learn/courses/пример/lessons/пример',
		},
	],
})
