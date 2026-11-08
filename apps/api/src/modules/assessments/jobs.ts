// Фоновые задачи модуля assessments (скилл background-jobs).
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { finalizeAttempt } from './quiz.service.ts'
import { quizAttempts } from './schema.ts'

/**
 * Раз в минуту по всем школам: просроченные попытки теста сдаются автоматически (оценивается сохранённое). Страховка:
 * ученик, закрывший страницу, не держит попытку открытой, а лимит попыток считается верно.
 */
export const expireAttemptsJob = defineJob({
	name: 'assessments.expire-attempts',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '* * * * *',
	handler: async (ctx) => {
		const due = await ctx.db
			.select({ id: quizAttempts.id })
			.from(quizAttempts)
			.where(
				and(
					eq(quizAttempts.status, 'in_progress'),
					isNotNull(quizAttempts.deadlineAt),
					lte(quizAttempts.deadlineAt, ctx.now()),
				),
			)
		for (const a of due) await finalizeAttempt(ctx, a.id)
		if (due.length) ctx.log.info({ count: due.length }, 'expired attempts submitted')
	},
})
