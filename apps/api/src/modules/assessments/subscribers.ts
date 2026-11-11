// Подписчики модуля assessments (скилл events-automations, карточки 3.5, 4.8): письма ученику о проверке работы и теста.
import { toPlainText } from '@dinastia/contracts/common'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx } from '#/kernel/context.ts'
import { on } from '#/kernel/events.ts'
import { members } from '#/kernel/members/schema.ts'
import { lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import { quizGradedEmail } from './emails/quiz-graded.tsx'
import { submissionReviewedEmail } from './emails/submission-reviewed.tsx'
import { quizGraded, submissionReviewed } from './events.ts'
import { attemptQuestions, quizAnswers, quizAttempts, submissionComments, submissions } from './schema.ts'

/** Письмо ученику о результате проверки; автопринятие без проверки (нет проверяющего) письма не шлёт. */
export async function sendReviewedEmail(
	ctx: BaseCtx,
	d: { submissionId: string; status: 'accepted' | 'needs_revision' | 'rejected' },
) {
	const [sub] = await ctx.db.select().from(submissions).where(eq(submissions.id, d.submissionId))
	if (!sub?.reviewerMemberId) return
	const [student] = await ctx.db
		.select({ email: users.email })
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(enrollments.id, sub.enrollmentId))
	const [lesson] = await ctx.db
		.select({ title: lessons.title, courseId: lessons.courseId })
		.from(lessons)
		.where(eq(lessons.id, sub.lessonId))
	if (!student || !lesson) return
	const [last] = await ctx.db
		.select({ body: submissionComments.body })
		.from(submissionComments)
		.where(eq(submissionComments.submissionId, sub.id))
		.orderBy(desc(submissionComments.createdAt))
		.limit(1)
	const comment = last ? toPlainText(last.body as never, { maxLength: 500 }).trim() : ''
	await ctx.mail.send(submissionReviewedEmail, {
		to: student.email,
		data: {
			lessonTitle: lesson.title,
			status: d.status,
			comment: comment || null,
			url: `${appOrigin(ctx.school.slug)}/learn/courses/${lesson.courseId}/lessons/${sub.lessonId}`,
		},
	})
}

export const reviewedEmailSubscriber = on(submissionReviewed, sendReviewedEmail, { key: 'email' })

/** Письмо о результате теста — только если оценку поставил проверяющий (ручная проверка); автопроверка — без письма. */
export async function sendQuizGradedEmail(ctx: BaseCtx, d: { attemptId: string; passed: boolean }) {
	const [manual] = await ctx.db
		.select({ id: quizAnswers.id })
		.from(quizAnswers)
		.innerJoin(attemptQuestions, eq(attemptQuestions.id, quizAnswers.attemptQuestionId))
		.where(and(eq(attemptQuestions.attemptId, d.attemptId), isNotNull(quizAnswers.gradedByMemberId)))
		.limit(1)
	if (!manual) return
	const [row] = await ctx.db
		.select({
			score: quizAttempts.score,
			maxScore: quizAttempts.maxScore,
			lessonId: quizAttempts.lessonId,
			email: users.email,
			lessonTitle: lessons.title,
			courseId: lessons.courseId,
		})
		.from(quizAttempts)
		.innerJoin(enrollments, eq(enrollments.id, quizAttempts.enrollmentId))
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
		.where(eq(quizAttempts.id, d.attemptId))
	if (!row) return
	await ctx.mail.send(quizGradedEmail, {
		to: row.email,
		data: {
			lessonTitle: row.lessonTitle,
			passed: d.passed,
			score: Math.round(row.score * 100) / 100,
			maxScore: row.maxScore,
			url: `${appOrigin(ctx.school.slug)}/learn/courses/${row.courseId}/lessons/${row.lessonId}`,
		},
	})
}

export const quizGradedEmailSubscriber = on(quizGraded, sendQuizGradedEmail, { key: 'email' })
