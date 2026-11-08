// Фоновые задачи модуля learning (скилл background-jobs).
import { Id } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { expireDueEnrollments } from './enrollment.service.ts'
import { sendCourseInvitation } from './invites.service.ts'

/** Раз в сутки по всем школам: зачисления с вышедшим сроком — в `expired` (доступ по дате ограничен и без задачи). */
export const expireEnrollmentsJob = defineJob({
	name: 'learning.expire-enrollments',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '10 3 * * *',
	handler: async (ctx) => {
		const n = await expireDueEnrollments(ctx)
		if (n) ctx.log.info({ count: n }, 'enrollments expired')
	},
})

/** Выпустить токен адресного приглашения на курс и отправить письмо (токен не попадает в очередь). */
export const sendCourseInvitationJob = defineJob({
	name: 'learning.send-course-invitation',
	schema: z.object({ inviteId: Id }),
	retry: { limit: 5, backoff: true },
	handler: (ctx, d) => sendCourseInvitation(ctx, d.inviteId),
})
