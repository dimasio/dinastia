// Письма владельцу об удалении школы (5.5): сразу после запроса и за 3 дня до удаления. Отправитель — платформа: школа
// закрыта, писать от её имени нельзя.
import { formatDate } from '@dinastia/i18n'
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout, EmailNote } from '../mail/define.tsx'

export const deletionEmail = defineEmail({
	key: 'school-deletion.notice',
	schema: z.object({
		kind: z.enum(['requested', 'soon']),
		schoolName: z.string(),
		deleteAt: z.iso.datetime(),
		/** «Мои школы» на корневом домене — там кнопка «Отменить удаление». */
		url: z.url(),
	}),
	subject: (d, t) =>
		t(`emails:schoolDeletion.${d.kind}.subject`, {
			school: d.schoolName,
			date: formatDate(d.deleteAt, 'Europe/Moscow'),
		}),
	Component: ({ data, t, school }) => {
		const vars = { school: data.schoolName, date: formatDate(data.deleteAt, 'Europe/Moscow') }
		return (
			<EmailLayout school={school} preview={t(`emails:schoolDeletion.${data.kind}.preview`, vars)}>
				<Text>{t(`emails:schoolDeletion.${data.kind}.body`, vars)}</Text>
				<EmailButton href={data.url}>{t('emails:schoolDeletion.cta')}</EmailButton>
				<EmailNote>{t('emails:schoolDeletion.note')}</EmailNote>
			</EmailLayout>
		)
	},
	examples: [
		{
			kind: 'requested',
			schoolName: 'Учебный центр «Охрана труда»',
			deleteAt: '2026-12-11T09:00:00.000Z',
			url: 'http://dinastia.localhost:5173/',
		},
		{
			kind: 'soon',
			schoolName: 'Учебный центр «Охрана труда»',
			deleteAt: '2026-12-11T09:00:00.000Z',
			url: 'http://dinastia.localhost:5173/',
		},
	],
})
