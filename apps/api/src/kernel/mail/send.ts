// Отправка писем (скилл notifications): ctx.mail.send ставит задачу `mail.send` в транзакции запроса — откат, и
// письма нет; задача рендерит шаблон и отправляет. Данные письма лежат в очереди открытым текстом — без секретов:
// письмо с токеном рендерит и отправляет сама задача модуля через deliverEmail (образец — приглашение).
import { z } from 'zod'
import { withTenant } from '../db/tenant.ts'
import { defineJob, type Jobs } from '../jobs.ts'
import { emailBrandProvider, emailByKey } from '../registry.ts'
import { type EmailDef, type EmailSchool, renderEmail } from './define.tsx'
import { sendMail } from './transport.ts'

export interface MailApi {
	/** Поставить письмо в очередь (в текущей транзакции). */
	send<D>(email: EmailDef<D>, msg: { to: string; data: D }): Promise<void>
}

/** Отрендерить и отправить сейчас — только внутри задачи (идемпотентность — на её стороне). */
export async function deliverEmail<D>(school: EmailSchool, email: EmailDef<D>, msg: { to: string; data: D }) {
	const { subject, html, text } = await renderEmail(email, msg.data, await withBrand(school))
	await sendMail({ to: msg.to, subject, html, text, fromName: school.name })
}

/** Школа с оформлением (5.9): письмо платформы (без id) и уже с оформлением — как есть. */
async function withBrand(school: EmailSchool): Promise<EmailSchool> {
	const provider = emailBrandProvider()
	const { id } = school
	if (!id || school.brand || !provider) return school
	return { ...school, brand: await withTenant(id, (tx) => provider(tx, { id, slug: school.slug })) }
}

export const mailSendJob = defineJob({
	name: 'mail.send',
	schema: z.object({ key: z.string(), to: z.string(), data: z.unknown() }),
	retry: { limit: 5, backoff: true },
	handler: async (ctx, d) => {
		const email = emailByKey(d.key)
		if (!email) throw new Error(`нет письма «${d.key}» в реестре`)
		await deliverEmail(ctx.school, email, { to: d.to, data: d.data })
		ctx.log.info({ template: d.key }, 'email sent')
	},
})

export function mailFor(jobs: Jobs): MailApi {
	return {
		async send(email, msg) {
			if (emailByKey(email.key) !== email)
				throw new Error(`письмо «${email.key}» не зарегистрировано в модуле (emails)`)
			await jobs.send(mailSendJob, { key: email.key, to: msg.to, data: email.schema.parse(msg.data) })
		},
	}
}
