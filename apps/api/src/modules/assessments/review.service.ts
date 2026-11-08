// Очередь проверки и переписка проверяющего (скилл lms-assessments, карточка 3.5): список работ школы, работа целиком,
// реплика без решения. Решения (принять, на доработку, отклонить) — `reviewSubmission` (3.4).
import type { ReviewDetail, ReviewListQuery, ReviewRow } from '@dinastia/contracts/assessments'
import { questionTypes } from '@dinastia/questions'
import { type AnyColumn, and, asc, count, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { listBlocks } from '#/kernel/blocks/blocks.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courses, lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import { quizAttempts, submissions } from './schema.ts'
import { addComment, viewOf } from './submission.service.ts'

/**
 * Область проверяющего: какие работы он видит и может проверять. До потоков (фаза 4) — все работы школы (изоляция школ —
 * RLS); в фазе 4 для куратора здесь появится ограничение по `group_curators` — единственное место, которое надо менять.
 */
export function reviewScope(_ctx: SchoolCtx): SQL | undefined {
	return undefined
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

const sourceOf = (ctx: SchoolCtx) => ({
	assignment: () =>
		ctx.db
			.select({
				id: submissions.id,
				studentName: users.name,
				studentEmail: users.email,
				courseId: courses.id,
				courseTitle: courses.title,
				lessonTitle: lessons.title,
				status: sql<ReviewRow['status']>`${submissions.status}::text`,
				revision: submissions.revision,
				submittedAt: submissions.submittedAt,
			})
			.from(submissions)
			.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
			.innerJoin(members, eq(members.id, enrollments.memberId))
			.innerJoin(users, eq(users.id, members.userId))
			.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
			.innerJoin(courses, eq(courses.id, lessons.courseId)),
	quiz: () =>
		ctx.db
			.select({
				id: quizAttempts.id,
				studentName: users.name,
				studentEmail: users.email,
				courseId: courses.id,
				courseTitle: courses.title,
				lessonTitle: lessons.title,
				status: sql<ReviewRow['status']>`${quizAttempts.status}::text`,
				// номер попытки этого ученика в этом тесте
				revision: sql<number>`(row_number() over (partition by ${quizAttempts.enrollmentId}, ${quizAttempts.lessonId}, ${quizAttempts.blockKey} order by ${quizAttempts.startedAt}))::int`,
				submittedAt: quizAttempts.submittedAt,
			})
			.from(quizAttempts)
			.innerJoin(enrollments, eq(enrollments.id, quizAttempts.enrollmentId))
			.innerJoin(members, eq(members.id, enrollments.memberId))
			.innerJoin(users, eq(users.id, members.userId))
			.innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
			.innerJoin(courses, eq(courses.id, lessons.courseId)),
})

/** Попытка попадает в очередь, если в ней есть вопрос с ручной проверкой. */
const hasManualQuestions = () => {
	const types = Object.values(questionTypes)
		.filter((d) => d.manual)
		.map((d) => d.type)
	return sql`exists (
		select 1 from attempt_questions aq join questions q on q.id = aq.question_id
		where aq.attempt_id = ${quizAttempts.id} and q.type in (${sql.join(
			types.map((t) => sql`${t}`),
			sql`, `,
		)}))`
}

/**
 * Очередь: работы по заданиям (черновики не видны) и попытки тестов с ручными вопросами; «на проверке» сверху, дальше по дате
 * отправки. Два источника — каждый отдаёт нужное число строк, затем слияние (страницы малы, очередь — рабочий список).
 */
export async function listQueue(ctx: SchoolCtx, input: ReviewListQuery) {
	const scope = reviewScope(ctx)
	const { status, courseId, kind } = input.filters
	const like = input.q ? `%${likeEscape(input.q)}%` : null
	const person = like ? or(ilike(users.name, like), ilike(users.email, like)) : undefined
	const src = sourceOf(ctx)
	const limit = input.page * input.pageSize
	const dir = (col: SQL | AnyColumn) => (input.dir === 'desc' ? desc(col) : asc(col))
	const waiting = (col: AnyColumn) => sql`case when ${col}::text = 'submitted' then 0 else 1 end`

	const wantAssignments = kind !== 'quiz' && status !== 'graded'
	const wantQuizzes = kind !== 'assignment' && (!status || status === 'submitted' || status === 'graded')

	const asgWhere = and(
		sql`${submissions.status} <> 'draft'`,
		scope,
		status ? eq(submissions.status, status as never) : undefined,
		courseId ? eq(courses.id, courseId) : undefined,
		person,
	)
	const quizWhere = and(
		sql`${quizAttempts.status} <> 'in_progress'`,
		hasManualQuestions(),
		scope,
		status ? eq(quizAttempts.status, status as never) : undefined,
		courseId ? eq(courses.id, courseId) : undefined,
		person,
	)
	const [asg, asgTotal, quiz, quizTotal] = await Promise.all([
		wantAssignments
			? src
					.assignment()
					.where(asgWhere)
					.orderBy(waiting(submissions.status), dir(submissions.submittedAt), asc(submissions.id))
					.limit(limit)
			: [],
		wantAssignments
			? ctx.db
					.select({ n: count() })
					.from(submissions)
					.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
					.innerJoin(members, eq(members.id, enrollments.memberId))
					.innerJoin(users, eq(users.id, members.userId))
					.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
					.innerJoin(courses, eq(courses.id, lessons.courseId))
					.where(asgWhere)
			: [{ n: 0 }],
		wantQuizzes
			? src
					.quiz()
					.where(quizWhere)
					.orderBy(waiting(quizAttempts.status), dir(quizAttempts.submittedAt), asc(quizAttempts.id))
					.limit(limit)
			: [],
		wantQuizzes
			? ctx.db
					.select({ n: count() })
					.from(quizAttempts)
					.innerJoin(enrollments, eq(enrollments.id, quizAttempts.enrollmentId))
					.innerJoin(members, eq(members.id, enrollments.memberId))
					.innerJoin(users, eq(users.id, members.userId))
					.innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
					.innerJoin(courses, eq(courses.id, lessons.courseId))
					.where(quizWhere)
			: [{ n: 0 }],
	])
	const rows: ReviewRow[] = [
		...asg.map((r) => ({ ...r, kind: 'assignment' as const })),
		...quiz.map((r) => ({ ...r, kind: 'quiz' as const })),
	]
	const rank = (r: ReviewRow) => (r.status === 'submitted' ? 0 : 1)
	const time = (r: ReviewRow) => r.submittedAt?.getTime() ?? 0
	rows.sort(
		(x, y) =>
			rank(x) - rank(y) || (input.dir === 'desc' ? time(y) - time(x) : time(x) - time(y)) || x.id.localeCompare(y.id),
	)
	const total = (asgTotal[0]?.n ?? 0) + (quizTotal[0]?.n ?? 0)
	return toPage(rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total, input)
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
