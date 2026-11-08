// Подписчики модуля assessments (скилл events-automations, карточка 3.5).
import { toPlainText } from '@dinastia/contracts/common'
import { desc, eq } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx } from '#/kernel/context.ts'
import { on } from '#/kernel/events.ts'
import { members } from '#/kernel/members/schema.ts'
import { lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import { submissionReviewedEmail } from './emails/submission-reviewed.tsx'
import { submissionReviewed } from './events.ts'
import { submissionComments, submissions } from './schema.ts'

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
