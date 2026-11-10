// Фоновые задачи модуля learning (скилл background-jobs).
import { Id } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { expireDueEnrollments } from './enrollment.service.ts'
import { sendCourseInvitation } from './invites.service.ts'
import { recalcCourseProgress } from './service.ts'

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

/** Пересчитать `progress_pct` учеников курса (4.3) вручную; по событиям то же делают подписчики (`subscribers.ts`). */
export const recalcCourseProgressJob = defineJob({
	name: 'learning.recalc-course-progress',
	schema: z.object({ courseId: Id }),
	singletonKey: (d) => d.courseId,
	handler: async (ctx, d) => {
		const n = await recalcCourseProgress(ctx, d.courseId)
		ctx.log.info({ courseId: d.courseId, count: n }, 'course progress recalculated')
	},
})

/** Выпустить токен адресного приглашения на курс и отправить письмо (токен не попадает в очередь). */
export const sendCourseInvitationJob = defineJob({
	name: 'learning.send-course-invitation',
	schema: z.object({ inviteId: Id }),
	retry: { limit: 5, backoff: true },
	handler: (ctx, d) => sendCourseInvitation(ctx, d.inviteId),
})
