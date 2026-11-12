// Выгрузка учеников курса в xlsx (карточка 4.6): колонки «Учеников» и прогресс по урокам; фильтры экрана; область куратора
// фиксируется в запросе (`scopeGroupList`) — задача выполняется без пользователя.

import { Id } from '@dinastia/contracts/common'
import { EnrollmentStatus, GroupFilter } from '@dinastia/contracts/learning'
import { and, asc, gt } from 'drizzle-orm'
import { z } from 'zod'
import { fail } from '#/kernel/errors.ts'
import { defineExport } from '#/kernel/exports/define.ts'
import { courseCards } from '../courses/service.ts'
import { enrollmentRowsQuery, enrollmentsWhere, withProgress } from './enrollment.service.ts'
import { groupScopeOf, scopeGroupList } from './policies.ts'
import { enrollments } from './schema.ts'

const BATCH = 500

const Input = z.object({
	courseId: Id,
	q: z.string().max(200).optional(),
	status: EnrollmentStatus.optional(),
	groupId: GroupFilter.optional(),
})
type Params = z.infer<typeof Input> & { groups: string[] | null }

export const courseStudentsExport = defineExport({
	key: 'learning.course-students',
	perm: 'learning.analytics',
	input: Input,
	prepare: async (ctx, input): Promise<Params> => {
		const [course] = await courseCards(ctx, [input.courseId])
		if (!course) return fail.notFound('COURSE_NOT_FOUND')
		return { ...input, groups: await scopeGroupList(ctx) }
	},
	fileName: async (ctx, p: Params) => {
		const [course] = await courseCards(ctx, [p.courseId])
		return `${course?.title ?? 'Курс'} — слушатели`
	},
	columns: [
		{ key: 'name', title: 'learning:export.columns.name', width: 30 },
		{ key: 'email', title: 'learning:export.columns.email', width: 30 },
		{ key: 'group', title: 'learning:export.columns.group', width: 20 },
		{ key: 'status', title: 'learning:export.columns.status', labels: 'learning:enrollments.values.status', width: 18 },
		{ key: 'enrolledAt', title: 'learning:export.columns.enrolledAt', type: 'date', width: 14 },
		{ key: 'expiresAt', title: 'learning:export.columns.expiresAt', type: 'date', width: 14 },
		{ key: 'progressPct', title: 'learning:export.columns.progress', type: 'percent', width: 12 },
		{ key: 'lessonsCompleted', title: 'learning:export.columns.lessonsCompleted', type: 'number', width: 14 },
		{ key: 'lessonsTotal', title: 'learning:export.columns.lessonsTotal', type: 'number', width: 12 },
		{ key: 'overdueCount', title: 'learning:export.columns.overdue', type: 'number', width: 12 },
		{ key: 'lastActivityAt', title: 'learning:export.columns.lastActivityAt', type: 'datetime', width: 18 },
	],
	rows: async function* (ctx, p: Params) {
		const where = enrollmentsWhere(groupScopeOf(p.groups), p, ctx.now())
		let after: string | null = null
		for (;;) {
			const page = await enrollmentRowsQuery(ctx, and(where, after ? gt(enrollments.id, after) : undefined))
				.orderBy(asc(enrollments.id))
				.limit(BATCH)
			if (!page.length) return
			const rows = await withProgress(ctx, page)
			yield rows.map((r) => ({
				name: r.studentName,
				email: r.studentEmail,
				group: r.groupTitle,
				status: r.status,
				enrolledAt: r.enrolledAt,
				expiresAt: r.expiresAt,
				progressPct: r.progressPct,
				lessonsCompleted: r.lessonsCompleted,
				lessonsTotal: r.lessonsTotal,
				overdueCount: r.overdueCount,
				lastActivityAt: r.lastActivityAt,
			}))
			after = page[page.length - 1]?.id ?? null
			if (page.length < BATCH) return
		}
	},
})
