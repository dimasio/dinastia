// Подписчики модуля certificates (скилл events-automations): курс пройден — выдать сертификат, если у курса включён шаблон.
// Повтор задачи безопасен: второй сертификат на зачисление не выдаётся.
import { on } from '#/kernel/events.ts'
import { enrollmentCompleted } from '../learning/events.ts'
import { issueForEnrollment } from './service.ts'

export const enrollmentCompletedSubscriber = on(
	enrollmentCompleted,
	(ctx, d) => issueForEnrollment(ctx, d.enrollmentId),
	{
		key: 'issue',
	},
)
