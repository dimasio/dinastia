// Результаты тестов и заданий курса для аналитики (карточка 4.6): по опубликованным урокам в порядке курса. Ученики — без
// отозванных; куратор — только свои потоки (`groupScope`). Тест «сдан» и средний балл — по лучшей попытке ученика.
import type { CourseResults } from '@dinastia/contracts/assessments'
import { GROUP_NONE } from '@dinastia/contracts/learning'
import { and, eq, inArray, isNull, ne, type SQL } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { publishedOutline } from '../courses/service.ts'
import { flatLessons } from '../learning/access.ts'
import { groupScope } from '../learning/policies.ts'
import { enrollments } from '../learning/schema.ts'
import { quizAttempts, submissions } from './schema.ts'

const round1 = (n: number) => Math.round(n * 10) / 10

export async function courseResults(
	ctx: SchoolCtx,
	input: { courseId: string; groupId?: string | undefined },
): Promise<CourseResults> {
	const outline = await publishedOutline(ctx, input.courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	const lessons = flatLessons(outline)
	if (!lessons.length) return { quizzes: [], assignments: [] }
	const order = new Map(lessons.map((l, i) => [l.id, i]))
	const titles = new Map(lessons.map((l) => [l.id, l.title]))
	const who: SQL | undefined = and(
		eq(enrollments.courseId, input.courseId),
		ne(enrollments.status, 'revoked'),
		groupScope(ctx),
		input.groupId === GROUP_NONE
			? isNull(enrollments.groupId)
			: input.groupId
				? eq(enrollments.groupId, input.groupId)
				: undefined,
	)
	const lessonIds = lessons.map((l) => l.id)

	const attempts = await ctx.db
		.select({
			lessonId: quizAttempts.lessonId,
			blockKey: quizAttempts.blockKey,
			enrollmentId: quizAttempts.enrollmentId,
			status: quizAttempts.status,
			score: quizAttempts.score,
			maxScore: quizAttempts.maxScore,
			passed: quizAttempts.passed,
		})
		.from(quizAttempts)
		.innerJoin(enrollments, eq(enrollments.id, quizAttempts.enrollmentId))
		.where(and(who, inArray(quizAttempts.lessonId, lessonIds), ne(quizAttempts.status, 'in_progress')))
	type Student = { attempts: number; best: number | null; passed: boolean; pending: boolean }
	const quizzes = new Map<string, { lessonId: string; blockKey: string; students: Map<string, Student> }>()
	for (const a of attempts) {
		const key = `${a.lessonId}:${a.blockKey}`
		const q = quizzes.get(key) ?? { lessonId: a.lessonId, blockKey: a.blockKey, students: new Map() }
		quizzes.set(key, q)
		const s = q.students.get(a.enrollmentId) ?? { attempts: 0, best: null, passed: false, pending: false }
		q.students.set(a.enrollmentId, s)
		s.attempts++
		if (a.status === 'submitted') s.pending = true
		if (a.status === 'graded') {
			const pct = a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0
			if (s.best === null || pct > s.best) s.best = pct
			if (a.passed) s.passed = true
		}
	}

	const subs = await ctx.db
		.select({ lessonId: submissions.lessonId, blockKey: submissions.blockKey, status: submissions.status })
		.from(submissions)
		.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
		.where(and(who, inArray(submissions.lessonId, lessonIds), ne(submissions.status, 'draft')))
	const works = new Map<string, CourseResults['assignments'][number]>()
	for (const s of subs) {
		const key = `${s.lessonId}:${s.blockKey}`
		const w = works.get(key) ?? {
			lessonId: s.lessonId,
			lessonTitle: titles.get(s.lessonId) ?? '',
			blockKey: s.blockKey,
			submitted: 0,
			accepted: 0,
			needsRevision: 0,
			rejected: 0,
			pending: 0,
		}
		works.set(key, w)
		w.submitted++
		if (s.status === 'accepted') w.accepted++
		else if (s.status === 'needs_revision') w.needsRevision++
		else if (s.status === 'rejected') w.rejected++
		else w.pending++
	}

	const byLesson = <T extends { lessonId: string }>(xs: T[]) =>
		xs.sort((a, b) => (order.get(a.lessonId) ?? 0) - (order.get(b.lessonId) ?? 0))
	return {
		quizzes: byLesson(
			[...quizzes.values()].map((q) => {
				const students = [...q.students.values()]
				const graded = students.flatMap((s) => (s.best === null ? [] : [s.best]))
				return {
					lessonId: q.lessonId,
					lessonTitle: titles.get(q.lessonId) ?? '',
					blockKey: q.blockKey,
					students: students.length,
					passed: students.filter((s) => s.passed).length,
					avgBestPct: graded.length ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length) : null,
					avgAttempts: round1(students.reduce((a, s) => a + s.attempts, 0) / students.length),
					pendingReview: students.filter((s) => s.pending).length,
				}
			}),
		),
		assignments: byLesson([...works.values()]),
	}
}
