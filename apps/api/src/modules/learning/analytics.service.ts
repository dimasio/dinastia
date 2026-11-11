// Аналитика курса (карточка 4.6): сводка по ученикам и воронка по урокам. Ученики — без отозванных; куратор — только свои
// потоки (`groupScope`). Просрочки — `computeAccess`, как у ученика (`courseStates`).
import type { CourseAnalytics, CourseAnalyticsInput } from '@dinastia/contracts/learning'
import { GROUP_NONE } from '@dinastia/contracts/learning'
import { and, eq, isNull, ne } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { publishedOutline } from '../courses/service.ts'
import { groupScope } from './policies.ts'
import { enrollments } from './schema.ts'
import { courseStates } from './state.ts'

export async function courseAnalytics(ctx: SchoolCtx, input: CourseAnalyticsInput): Promise<CourseAnalytics> {
	const outline = await publishedOutline(ctx, input.courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	const rows = await ctx.db
		.select()
		.from(enrollments)
		.where(
			and(
				eq(enrollments.courseId, input.courseId),
				ne(enrollments.status, 'revoked'),
				groupScope(ctx),
				input.groupId === GROUP_NONE
					? isNull(enrollments.groupId)
					: input.groupId
						? eq(enrollments.groupId, input.groupId)
						: undefined,
			),
		)
	const states = await courseStates(ctx, rows)
	const lessons = outline.sections.flatMap((s) =>
		s.lessons.map((l) => ({
			lessonId: l.id,
			title: l.title,
			sectionTitle: s.title,
			opened: 0,
			completed: 0,
			overdue: 0,
		})),
	)
	const byId = new Map(lessons.map((l) => [l.lessonId, l]))
	const summary = { learners: rows.length, learning: 0, completed: 0, expired: 0, avgProgressPct: 0, withOverdue: 0 }
	let progress = 0
	for (const s of states) {
		const e = s.enrollment
		progress += e.progressPct
		if (s.closed) summary.expired++
		else if (e.status === 'completed') summary.completed++
		else summary.learning++
		for (const [lessonId, f] of s.facts) {
			const l = byId.get(lessonId)
			if (!l) continue
			l.opened++
			if (f.completedAt) l.completed++
		}
		let overdue = false
		for (const a of s.access)
			if (a.overdue) {
				overdue = true
				const l = byId.get(a.lessonId)
				if (l) l.overdue++
			}
		if (overdue) summary.withOverdue++
	}
	summary.avgProgressPct = rows.length ? Math.round(progress / rows.length) : 0
	return { summary, lessons }
}
