// Письмо ученику о результате проверки работы (карточка 3.5, скилл notifications): принято / нужна доработка / отклонено,
// комментарий проверяющего и ссылка на урок. Шлёт подписчик события `submission.reviewed`.
import { Button, Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailLayout } from '#/kernel/mail/define.tsx'

export const submissionReviewedEmail = defineEmail({
	key: 'assessments.submission-reviewed',
	schema: z.object({
		lessonTitle: z.string(),
		status: z.enum(['accepted', 'needs_revision', 'rejected']),
		/** Комментарий проверяющего простым текстом; нет — пусто. */
		comment: z.string().nullable(),
		url: z.url(),
	}),
	subject: (d, t, school) =>
		t(`emails:submissionReviewed.subject.${d.status}`, { school: school.name, lesson: d.lessonTitle }),
	Component: ({ data, t, school }) => {
		const vars = { school: school.name, lesson: data.lessonTitle }
		return (
			<EmailLayout school={school} preview={t(`emails:submissionReviewed.preview.${data.status}`, vars)}>
				<Text>{t(`emails:submissionReviewed.body.${data.status}`, vars)}</Text>
				{data.comment && (
					<Text style={{ borderLeft: '3px solid #d4d4d4', color: '#404040', margin: '12px 0', padding: '4px 12px' }}>
						{data.comment}
					</Text>
				)}
				<Button
					href={data.url}
					style={{ backgroundColor: '#171717', borderRadius: 6, color: '#ffffff', padding: '12px 20px' }}
				>
					{t('emails:submissionReviewed.cta')}
				</Button>
			</EmailLayout>
		)
	},
	examples: [
		{
			lessonTitle: 'Домашняя работа',
			status: 'needs_revision',
			comment: 'Добавьте тени и перспективу',
			url: 'http://demo.dinastia.localhost:5173/learn/courses/пример/lessons/пример',
		},
	],
})
