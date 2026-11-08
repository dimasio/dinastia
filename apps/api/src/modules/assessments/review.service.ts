// Очередь проверки и переписка проверяющего (скилл lms-assessments, карточка 3.5): список работ школы, работа целиком,
// реплика без решения. Решения (принять, на доработку, отклонить) — `reviewSubmission` (3.4).
import type { ReviewDetail, ReviewListQuery, ReviewRow } from '@dinastia/contracts/assessments'
import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { listBlocks } from '#/kernel/blocks/blocks.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courses, lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import { submissions } from './schema.ts'
import { addComment, viewOf } from './submission.service.ts'

/**
 * Область проверяющего: какие работы он видит и может проверять. До потоков (фаза 4) — все работы школы (изоляция школ —
 * RLS); в фазе 4 для куратора здесь появится ограничение по `group_curators` — единственное место, которое надо менять.
 */
export function reviewScope(_ctx: SchoolCtx): SQL | undefined {
	return undefined
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/** Очередь: отправленные работы (черновики не видны), «на проверке» — сверху, дальше по дате отправки. */
export async function listQueue(ctx: SchoolCtx, input: ReviewListQuery) {
	const conditions: SQL[] = [sql`${submissions.status} <> 'draft'`]
	const scope = reviewScope(ctx)
	if (scope) conditions.push(scope)
	if (input.filters.status) conditions.push(eq(submissions.status, input.filters.status))
	if (input.filters.courseId) conditions.push(eq(courses.id, input.filters.courseId))
	if (input.q) {
		const pattern = `%${likeEscape(input.q)}%`
		const any = or(ilike(users.name, pattern), ilike(users.email, pattern))
		if (any) conditions.push(any)
	}
	const where = and(...conditions)
	const from = ctx.db
		.select({
			id: submissions.id,
			studentName: users.name,
			studentEmail: users.email,
			courseId: courses.id,
			courseTitle: courses.title,
			lessonTitle: lessons.title,
			status: submissions.status,
			revision: submissions.revision,
			submittedAt: submissions.submittedAt,
		})
		.from(submissions)
		.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
		.innerJoin(courses, eq(courses.id, lessons.courseId))
		.where(where)
	const waitingFirst = sql`case when ${submissions.status} = 'submitted' then 0 else 1 end`
	const [items, [total]] = await Promise.all([
		from
			.orderBy(
				waitingFirst,
				input.dir === 'desc' ? sql`${submissions.submittedAt} desc` : asc(submissions.submittedAt),
				asc(submissions.id),
			)
			.limit(input.pageSize)
			.offset((input.page - 1) * input.pageSize),
		ctx.db
			.select({ n: count() })
			.from(submissions)
			.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
			.innerJoin(members, eq(members.id, enrollments.memberId))
			.innerJoin(users, eq(users.id, members.userId))
			.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
			.innerJoin(courses, eq(courses.id, lessons.courseId))
			.where(where),
	])
	return toPage(items satisfies ReviewRow[], total?.n ?? 0, input)
}

/** Работа, доступная проверяющему (по области); иначе SUBMISSION_NOT_FOUND. */
async function scopedSubmission(ctx: SchoolCtx, submissionId: string) {
	const scope = reviewScope(ctx)
	const [row] = await ctx.db
		.select()
		.from(submissions)
		.where(scope ? and(eq(submissions.id, submissionId), scope) : eq(submissions.id, submissionId))
	return row ?? fail.notFound('SUBMISSION_NOT_FOUND')
}

export async function getForReview(ctx: SchoolCtx, submissionId: string): Promise<ReviewDetail> {
	const row = await scopedSubmission(ctx, submissionId)
	// черновик — личное дело ученика, проверяющему не показывается
	if (row.status === 'draft') return fail.notFound('SUBMISSION_NOT_FOUND')
	const [meta] = await ctx.db
		.select({
			studentName: users.name,
			studentEmail: users.email,
			courseId: courses.id,
			courseTitle: courses.title,
			lessonTitle: lessons.title,
		})
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.innerJoin(lessons, eq(lessons.id, row.lessonId))
		.innerJoin(courses, eq(courses.id, lessons.courseId))
		.where(eq(enrollments.id, row.enrollmentId))
	if (!meta) return fail.notFound('SUBMISSION_NOT_FOUND')
	const block = (await listBlocks(ctx, row.lessonId, 'published')).find(
		(b) => b.blockKey === row.blockKey && b.type === 'assignment',
	)
	return {
		submission: await viewOf(ctx, row),
		student: { name: meta.studentName, email: meta.studentEmail },
		course: { id: meta.courseId, title: meta.courseTitle },
		lesson: { id: row.lessonId, title: meta.lessonTitle },
		prompt: ((block?.data as { prompt?: unknown } | undefined)?.prompt as ReviewDetail['prompt']) ?? null,
		promptFiles: block?.files ?? {},
	}
}

/** Реплика проверяющего без решения: в любом статусе, кроме черновика; статус не меняется. */
export async function commentAsReviewer(
	ctx: SchoolCtx,
	input: { submissionId: string; body: ReviewDetail['prompt']; fileIds: string[] },
): Promise<ReviewDetail> {
	const row = await scopedSubmission(ctx, input.submissionId)
	if (row.status === 'draft') return fail.conflict('SUBMISSION_STATE', { from: row.status })
	await addComment(ctx, row.id, input as never)
	return getForReview(ctx, row.id)
}
