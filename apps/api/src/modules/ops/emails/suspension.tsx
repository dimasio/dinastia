// Письмо владельцу о приостановке и возобновлении школы оператором (5.6в). Отправитель — Dinastia.
import { Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailButton, EmailLayout } from '#/kernel/mail/define.tsx'

export const suspensionEmail = defineEmail({
	key: 'ops.school-suspension',
	schema: z.object({
		kind: z.enum(['suspended', 'resumed']),
		schoolName: z.string(),
		reason: z.string().nullable(),
		url: z.url(),
	}),
	subject: (d, t) => t(`emails:schoolSuspension.${d.kind}.subject`, { school: d.schoolName }),
	Component: ({ data, t, school }) => (
		<EmailLayout
			school={school}
			preview={t(`emails:schoolSuspension.${data.kind}.subject`, { school: data.schoolName })}
		>
			<Text>{t(`emails:schoolSuspension.${data.kind}.body`, { school: data.schoolName })}</Text>
			{data.reason ? <Text>{t('emails:schoolSuspension.reason', { reason: data.reason })}</Text> : null}
			<EmailButton href={data.url}>{t('emails:schoolSuspension.cta')}</EmailButton>
		</EmailLayout>
	),
	examples: [
		{
			kind: 'suspended',
			schoolName: 'Учебный центр «Охрана труда»',
			reason: 'Не оплачен тариф за ноябрь',
			url: 'http://trud.dinastia.localhost:5173/admin',
		},
		{
			kind: 'resumed',
			schoolName: 'Учебный центр «Охрана труда»',
			reason: null,
			url: 'http://trud.dinastia.localhost:5173/admin',
		},
	],
})
