// Данные ученика в обучении (5.5, скилл personal-data): зачисления, потоки, прогресс по урокам. При обезличивании
// прогресс и сроки остаются (статистика курса), удаляются приглашения на почту ученика.
import { eq, inArray } from 'drizzle-orm'
import { definePersonalData } from '#/kernel/personal-data/define.ts'
import { courses, lessons } from '../courses/schema.ts'
import { blockProgress, enrollmentInvites, enrollments, groups, lessonProgress } from './schema.ts'

export const learningPersonalData = definePersonalData({
	tables: [enrollments, lessonProgress, blockProgress, enrollmentInvites],
	export: async (ctx, s) => {
		const rows = await ctx.db
			.select({
				id: enrollments.id,
				course: courses.title,
				group: groups.title,
				status: enrollments.status,
				enrolledAt: enrollments.enrolledAt,
				expiresAt: enrollments.expiresAt,
				completedAt: enrollments.completedAt,
				revokedAt: enrollments.revokedAt,
				progressPct: enrollments.progressPct,
			})
			.from(enrollments)
			.innerJoin(courses, eq(courses.id, enrollments.courseId))
			.leftJoin(groups, eq(groups.id, enrollments.groupId))
			.where(eq(enrollments.memberId, s.memberId))
			.orderBy(enrollments.enrolledAt)
		const ids = rows.map((r) => r.id)
		const progress = ids.length
			? await ctx.db
					.select({
						enrollmentId: lessonProgress.enrollmentId,
						lesson: lessons.title,
						openedAt: lessonProgress.openedAt,
						completedAt: lessonProgress.completedAt,
					})
					.from(lessonProgress)
					.innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
					.where(inArray(lessonProgress.enrollmentId, ids))
					.orderBy(lessonProgress.openedAt)
			: []
		return {
			data: {
				enrollments: rows.map(({ id, ...r }) => ({
					...r,
					lessons: progress.filter((p) => p.enrollmentId === id).map(({ enrollmentId: _, ...p }) => p),
				})),
			},
			files: [],
		}
	},
	anonymize: async (ctx, s) => {
		await ctx.db.delete(enrollmentInvites).where(eq(enrollmentInvites.email, s.email))
	},
})
