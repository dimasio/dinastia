// Письмо ученику «тест проверен» (карточка 4.8): только после ручной проверки (автопроверку ученик видит сразу) — сдан или нет,
// баллы, ссылка на урок с разбором.
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const quizGradedEmail = defineEmail({
	key: 'assessments.quiz-graded',
	schema: z.object({
		lessonTitle: z.string(),
		passed: z.boolean(),
		score: z.number(),
		maxScore: z.number(),
		url: z.url(),
	}),
	subject: (d, t, school) => t('emails:quizGraded.subject', { school: school.name, lesson: d.lessonTitle }),
	Component: ({ data, t, school }) => {
		const result = data.passed ? 'passed' : 'failed'
		// баллы с долями — с запятой: 9,5
		const vars = {
			school: school.name,
			lesson: data.lessonTitle,
			score: String(data.score).replace('.', ','),
			max: data.maxScore,
		}
		return (
			<EmailLayout school={school} preview={t(`emails:quizGraded.preview.${result}`, vars)}>
				<Text>{t(`emails:quizGraded.body.${result}`, vars)}</Text>
				<EmailButton href={data.url}>{t('emails:quizGraded.cta')}</EmailButton>
			</EmailLayout>
		)
	},
	examples: [
		{
			lessonTitle: 'Итоговая аттестация',
			passed: true,
			score: 9.5,
			maxScore: 12,
			url: 'http://demo.dinastia.localhost:5173/learn',
		},
		{
			lessonTitle: 'Итоговая аттестация',
			passed: false,
			score: 4,
			maxScore: 12,
			url: 'http://demo.dinastia.localhost:5173/learn',
		},
	],
})
