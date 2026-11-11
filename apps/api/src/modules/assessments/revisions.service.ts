// Работы на доработке для кабинета ученика (карточка 4.5): только свои зачисления с открытым доступом (не истёкшие, не
// отозванные) и опубликованные уроки; в ответе — названия курса и урока, без текста работы и комментариев.
import type { MyRevision } from '@dinastia/contracts/assessments'
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { courses, lessons } from '../courses/schema.ts'
import { myEnrollments } from '../learning/service.ts'
import { isExpired } from '../learning/state.ts'
import { submissions } from './schema.ts'

export async function listMyRevisions(ctx: SchoolCtx): Promise<MyRevision[]> {
	const now = ctx.now()
	const open = (await myEnrollments(ctx)).filter((e) => e.status !== 'revoked' && !isExpired(e, now))
	if (!open.length) return []
	return ctx.db
		.select({
			submissionId: submissions.id,
			courseId: courses.id,
			courseTitle: courses.title,
			lessonId: lessons.id,
			lessonTitle: lessons.title,
			reviewedAt: submissions.reviewedAt,
		})
		.from(submissions)
		.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
		.innerJoin(courses, eq(courses.id, lessons.courseId))
		.where(
			and(
				eq(submissions.status, 'needs_revision'),
				inArray(
					submissions.enrollmentId,
					open.map((e) => e.id),
				),
				isNotNull(lessons.publishedAt),
				ne(courses.status, 'draft'),
			),
		)
		.orderBy(desc(submissions.reviewedAt), desc(submissions.id))
}
