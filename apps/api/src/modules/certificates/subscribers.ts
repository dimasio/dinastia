// Подписчики модуля certificates (скилл events-automations): курс пройден — выдать сертификат, если у курса включён шаблон
// (повтор задачи безопасен: второй сертификат на зачисление не выдаётся); PDF готов — письмо ученику (4.8).
import { on } from '#/kernel/events.ts'
import { enrollmentCompleted } from '../learning/events.ts'
import { certificateIssued } from './events.ts'
import { issueForEnrollment, sendIssuedEmail } from './service.ts'

export const enrollmentCompletedSubscriber = on(
	enrollmentCompleted,
	(ctx, d) => issueForEnrollment(ctx, d.enrollmentId),
	{
		key: 'issue',
	},
)

export const certificateIssuedSubscriber = on(certificateIssued, (ctx, d) => sendIssuedEmail(ctx, d.certificateId), {
	key: 'email',
})
