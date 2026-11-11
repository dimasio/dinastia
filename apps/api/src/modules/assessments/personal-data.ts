// Данные ученика в тестах и заданиях (5.5, скилл personal-data): попытки с ответами, работы с перепиской и файлами.
// Обезличивание: тексты ответов, работ и своих комментариев → «Удалено», свои файлы удаляются; баллы, статусы, даты и
// комментарии проверяющих остаются.

import { questions } from '@dinastia/db'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { definePersonalData } from '#/kernel/personal-data/define.ts'
import { DELETED_TEXT, deletedDoc } from '#/kernel/personal-data/personal-data.ts'
import { files } from '#/kernel/storage/schema.ts'
import { lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import {
	attemptQuestions,
	quizAnswers,
	quizAttempts,
	submissionCommentFiles,
	submissionComments,
	submissionFiles,
	submissions,
} from './schema.ts'

const enrollmentIds = async (
	ctx: Parameters<Parameters<typeof definePersonalData>[0]['export']>[0],
	memberId: string,
) =>
	(await ctx.db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.memberId, memberId))).map(
		(e) => e.id,
	)

export const assessmentsPersonalData = definePersonalData({
	tables: [quizAttempts, quizAnswers, submissions, submissionFiles, submissionComments, submissionCommentFiles],
	export: async (ctx, s) => {
		const ids = await enrollmentIds(ctx, s.memberId)
		if (!ids.length) return { data: { quizAttempts: [], submissions: [] }, files: [] }
		const attempts = await ctx.db
			.select({
				id: quizAttempts.id,
				lesson: lessons.title,
				status: quizAttempts.status,
				score: quizAttempts.score,
				maxScore: quizAttempts.maxScore,
				passed: quizAttempts.passed,
				startedAt: quizAttempts.startedAt,
				submittedAt: quizAttempts.submittedAt,
			})
			.from(quizAttempts)
			.innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
			.where(inArray(quizAttempts.enrollmentId, ids))
			.orderBy(quizAttempts.startedAt)
		const answers = attempts.length
			? await ctx.db
					.select({
						attemptId: attemptQuestions.attemptId,
						position: attemptQuestions.position,
						question: questions.prompt,
						text: quizAnswers.textValue,
						number: quizAnswers.numberValue,
						score: quizAnswers.score,
						isCorrect: quizAnswers.isCorrect,
						feedback: quizAnswers.feedback,
						answeredAt: quizAnswers.answeredAt,
					})
					.from(quizAnswers)
					.innerJoin(attemptQuestions, eq(attemptQuestions.id, quizAnswers.attemptQuestionId))
					.innerJoin(questions, eq(questions.id, attemptQuestions.questionId))
					.where(
						inArray(
							attemptQuestions.attemptId,
							attempts.map((a) => a.id),
						),
					)
					.orderBy(attemptQuestions.position)
			: []

		const works = await ctx.db
			.select({
				id: submissions.id,
				lesson: lessons.title,
				status: submissions.status,
				body: submissions.body,
				revision: submissions.revision,
				submittedAt: submissions.submittedAt,
				reviewedAt: submissions.reviewedAt,
			})
			.from(submissions)
			.innerJoin(lessons, eq(lessons.id, submissions.lessonId))
			.where(inArray(submissions.enrollmentId, ids))
			.orderBy(submissions.createdAt)
		const workIds = works.map((w) => w.id)
		const workFiles = workIds.length
			? await ctx.db
					.select({ submissionId: submissionFiles.submissionId, fileId: files.id, name: files.name })
					.from(submissionFiles)
					.innerJoin(files, eq(files.id, submissionFiles.fileId))
					.where(inArray(submissionFiles.submissionId, workIds))
					.orderBy(submissionFiles.position)
			: []
		const comments = workIds.length
			? await ctx.db
					.select({
						id: submissionComments.id,
						submissionId: submissionComments.submissionId,
						mine: sql<boolean>`${submissionComments.authorMemberId} = ${s.memberId}`,
						body: submissionComments.body,
						createdAt: submissionComments.createdAt,
					})
					.from(submissionComments)
					.where(inArray(submissionComments.submissionId, workIds))
					.orderBy(submissionComments.createdAt)
			: []
		const commentFiles = comments.length
			? await ctx.db
					.select({ commentId: submissionCommentFiles.commentId, fileId: files.id, name: files.name })
					.from(submissionCommentFiles)
					.innerJoin(files, eq(files.id, submissionCommentFiles.fileId))
					.where(
						inArray(
							submissionCommentFiles.commentId,
							comments.map((c) => c.id),
						),
					)
			: []

		const path = (dir: string, owner: string, f: { fileId: string; name: string }) =>
			`files/${dir}/${owner}/${f.fileId.slice(-8)}-${f.name}`
		return {
			data: {
				quizAttempts: attempts.map(({ id, ...a }) => ({
					...a,
					answers: answers.filter((x) => x.attemptId === id).map(({ attemptId: _, ...x }) => x),
				})),
				submissions: works.map(({ id, ...w }) => ({
					...w,
					files: workFiles.filter((f) => f.submissionId === id).map((f) => path('submissions', id, f)),
					comments: comments
						.filter((c) => c.submissionId === id)
						.map(({ id: cid, submissionId: _, mine, ...c }) => ({
							...c,
							author: mine ? 'student' : 'staff',
							files: commentFiles.filter((f) => f.commentId === cid).map((f) => path('comments', cid, f)),
						})),
				})),
			},
			files: [
				...workFiles.map((f) => ({ path: path('submissions', f.submissionId, f), fileId: f.fileId })),
				...commentFiles.map((f) => ({ path: path('comments', f.commentId, f), fileId: f.fileId })),
			],
		}
	},
	anonymize: async (ctx, s) => {
		const ids = await enrollmentIds(ctx, s.memberId)
		if (!ids.length) return
		const attempts = ctx.db
			.select({ id: quizAttempts.id })
			.from(quizAttempts)
			.where(inArray(quizAttempts.enrollmentId, ids))
		const questionsOf = ctx.db
			.select({ id: attemptQuestions.id })
			.from(attemptQuestions)
			.where(inArray(attemptQuestions.attemptId, attempts))
		await ctx.db
			.update(quizAnswers)
			.set({ textValue: DELETED_TEXT })
			.where(and(inArray(quizAnswers.attemptQuestionId, questionsOf), isNotNull(quizAnswers.textValue)))

		const works = ctx.db.select({ id: submissions.id }).from(submissions).where(inArray(submissions.enrollmentId, ids))
		await ctx.db
			.update(submissions)
			.set({ body: deletedDoc() })
			.where(and(inArray(submissions.id, works), isNotNull(submissions.body)))
		const removed = await ctx.db
			.delete(submissionFiles)
			.where(inArray(submissionFiles.submissionId, works))
			.returning({ fileId: submissionFiles.fileId })

		const mine = ctx.db
			.select({ id: submissionComments.id })
			.from(submissionComments)
			.where(eq(submissionComments.authorMemberId, s.memberId))
		await ctx.db.update(submissionComments).set({ body: deletedDoc() }).where(inArray(submissionComments.id, mine))
		const removedComments = await ctx.db
			.delete(submissionCommentFiles)
			.where(inArray(submissionCommentFiles.commentId, mine))
			.returning({ fileId: submissionCommentFiles.fileId })
		for (const f of [...removed, ...removedComments]) await ctx.files.remove(f.fileId)
	},
})
