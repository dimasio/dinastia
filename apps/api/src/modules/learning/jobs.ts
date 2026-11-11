// Фоновые задачи модуля learning (скилл background-jobs).
import { Id } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { sendDeadlineReminders } from './deadlines.service.ts'
import { expireDueEnrollments } from './enrollment.service.ts'
import { sendCourseInvitation } from './invites.service.ts'
import { sendLessonOpenedNotices } from './lesson-notices.service.ts'
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

/** Раз в день в 10:00 по Москве по всем школам: напоминания «завтра срок» и «срок прошёл» (4.4). */
export const deadlineRemindersJob = defineJob({
	name: 'learning.deadline-reminders',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '0 10 * * *',
	handler: async (ctx) => {
		const n = await sendDeadlineReminders(ctx)
		if (n) ctx.log.info({ count: n }, 'deadline reminders sent')
	},
})

/** Выпустить токен адресного приглашения на курс и отправить письмо (токен не попадает в очередь). */
export const sendCourseInvitationJob = defineJob({
	name: 'learning.send-course-invitation',
	schema: z.object({ inviteId: Id }),
	retry: { limit: 5, backoff: true },
	handler: (ctx, d) => sendCourseInvitation(ctx, d.inviteId),
})

/** Раз в день в 09:00 по Москве по всем школам: письма «открылись новые уроки» по расписанию (4.8). */
export const lessonOpenedNoticesJob = defineJob({
	name: 'learning.lesson-opened-notices',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '0 9 * * *',
	handler: async (ctx) => {
		const n = await sendLessonOpenedNotices(ctx)
		if (n) ctx.log.info({ count: n }, 'lesson opened notices sent')
	},
})
