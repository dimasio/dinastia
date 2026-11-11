// Метрики школы (5.6б): считаются в транзакции школы (RLS) — и задачей раз в час, и живьём в карточке школы.
import { and, count, countDistinct, eq, gt, max, ne, sum } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '#/kernel/auth/schema.ts'
import type { BaseCtx } from '#/kernel/context.ts'
import { defineJob } from '#/kernel/jobs.ts'
import { members } from '#/kernel/members/schema.ts'
import { files } from '#/kernel/storage/schema.ts'
import { courses } from '../courses/schema.ts'
import { enrollments, lessonProgress } from '../learning/schema.ts'
import { schoolStats } from './schema.ts'

const DAY = 24 * 60 * 60 * 1000

export async function computeSchoolStats(ctx: Pick<BaseCtx, 'db' | 'now'>) {
	const since = new Date(ctx.now().getTime() - 30 * DAY)
	const [students] = await ctx.db
		.select({ n: count() })
		.from(members)
		.where(and(eq(members.role, 'student'), ne(members.status, 'deleted')))
	const [activity] = await ctx.db
		.select({ active: countDistinct(enrollments.memberId) })
		.from(lessonProgress)
		.innerJoin(enrollments, eq(enrollments.id, lessonProgress.enrollmentId))
		.where(gt(lessonProgress.openedAt, since))
	const [last] = await ctx.db.select({ at: max(lessonProgress.openedAt) }).from(lessonProgress)
	const [courseCount] = await ctx.db.select({ n: count() }).from(courses).where(ne(courses.status, 'archived'))
	const [storage] = await ctx.db.select({ bytes: sum(files.size) }).from(files)
	const [owner] = await ctx.db
		.select({ email: users.email })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(members.role, 'owner'))
		.limit(1)
	return {
		students: students?.n ?? 0,
		activeStudents30d: activity?.active ?? 0,
		courses: courseCount?.n ?? 0,
		storageBytes: Number(storage?.bytes ?? 0),
		ownerEmail: owner?.email ?? null,
		lastActivityAt: last?.at ?? null,
	}
}

/** Пересчитать и сохранить метрики школы (строка — по школе транзакции). */
export async function refreshSchoolStats(ctx: Pick<BaseCtx, 'db' | 'now' | 'school'>) {
	const stats = await computeSchoolStats(ctx)
	const row = { ...stats, updatedAt: ctx.now() }
	await ctx.db
		.insert(schoolStats)
		.values({ schoolId: ctx.school.id, ...row })
		.onConflictDoUpdate({ target: schoolStats.schoolId, set: row })
	return stats
}

export const schoolStatsJob = defineJob({
	name: 'ops.school-stats',
	scope: 'all-schools',
	schema: z.object({}),
	schedule: '7 * * * *',
	handler: (ctx) => refreshSchoolStats(ctx),
})
