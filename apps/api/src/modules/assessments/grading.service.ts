// Ручная проверка ответов `open_text` в попытках теста (скилл lms-assessments, карточка 3.6): попытка целиком для проверяющего,
// оценки (баллы 0…максимум, шаг 0,5, комментарий), итог попытки после оценки всех ручных вопросов. Область — `reviewScope`.
import type { AttemptReview } from '@dinastia/contracts/assessments'
import { isEmptyDoc } from '@dinastia/contracts/common'
import { questionDef } from '@dinastia/questions'
import { and, eq, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courses, lessons } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'
import { recordBlockResult } from '../learning/service.ts'
import { decodeResponse } from './answers.ts'
import { quizGraded } from './events.ts'
import { loadParts, publicInAttempt, settingsOf, summary } from './quiz.service.ts'
import { reviewScope } from './review.service.ts'
import { quizAnswers, quizAttempts } from './schema.ts'

/** Попытка в области проверяющего; отправленная (не идущая) и с ручными вопросами — иначе ATTEMPT_NOT_FOUND. */
async function scopedAttempt(ctx: SchoolCtx, attemptId: string) {
	const scope = reviewScope(ctx)
	const [row] = await ctx.db
		.select()
		.from(quizAttempts)
		.where(scope ? and(eq(quizAttempts.id, attemptId), scope) : eq(quizAttempts.id, attemptId))
	if (!row || row.status === 'in_progress') return fail.notFound('ATTEMPT_NOT_FOUND')
	return row
}

export async function getAttemptForReview(ctx: SchoolCtx, attemptId: string): Promise<AttemptReview> {
	const attempt = await scopedAttempt(ctx, attemptId)
	const p = await loadParts(ctx, attemptId)
	const manualCount = p.aqs.filter((aq) => {
		const q = p.questions.get(aq.questionId)
		return q && questionDef(q.type)?.manual
	}).length
	if (manualCount === 0) return fail.notFound('ATTEMPT_NOT_FOUND') // без ручных вопросов проверять нечего
	const [meta] = await ctx.db
		.select({
			name: users.name,
			email: users.email,
			courseId: courses.id,
			courseTitle: courses.title,
			lessonTitle: lessons.title,
		})
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.innerJoin(lessons, eq(lessons.id, attempt.lessonId))
		.innerJoin(courses, eq(courses.id, lessons.courseId))
		.where(eq(enrollments.id, attempt.enrollmentId))
	if (!meta) return fail.notFound('ATTEMPT_NOT_FOUND')
	let passScorePct = 60
	try {
		passScorePct = (await settingsOf(ctx, attempt.lessonId, attempt.blockKey)).passScorePct
	} catch {
		// блок убрали из урока — порог по умолчанию
	}
	let autoScore = 0
	let manualMax = 0
	const questions = p.aqs.flatMap((aq) => {
		const q = p.questions.get(aq.questionId)
		const def = q ? questionDef(q.type) : undefined
		if (!q || !def) return []
		const rows = p.answers.get(aq.id) ?? null
		const manual = Boolean(def.manual)
		if (manual) manualMax += aq.points
		else autoScore += rows?.score ?? 0
		return [
			{
				id: aq.id,
				type: q.type,
				points: aq.points,
				manual,
				data: publicInAttempt(q, p.order.get(aq.id)),
				response: decodeResponse(def, rows),
				score: rows?.score ?? null,
				isCorrect: rows?.isCorrect ?? null,
				feedback: (rows?.feedback as never) ?? null,
			},
		]
	})
	return {
		attempt: summary(attempt),
		student: { name: meta.name, email: meta.email },
		course: { id: meta.courseId, title: meta.courseTitle },
		lesson: { id: attempt.lessonId, title: meta.lessonTitle },
		autoScore: Math.round(autoScore * 100) / 100,
		manualMax,
		passScorePct,
		questions,
	}
}

/**
 * Оценки ручных вопросов: баллы 0…максимум вопроса с шагом 0,5, комментарий. Сохранять можно частями; когда оценены все ручные
 * вопросы, попытка становится `graded`: итог, `passed` по порогу, событие `quiz.graded`, результат блока для урока.
 * Оценённую попытку переоценивать нельзя (`ATTEMPT_STATE`).
 */
export async function gradeAttempt(
	ctx: SchoolCtx,
	input: { attemptId: string; grades: { attemptQuestionId: string; score: number; feedback: unknown }[] },
): Promise<AttemptReview> {
	const attempt = await scopedAttempt(ctx, input.attemptId)
	await ctx.db.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.id, attempt.id)).for('update')
	const [current] = await ctx.db.select().from(quizAttempts).where(eq(quizAttempts.id, attempt.id))
	if (current?.status !== 'submitted') return fail.conflict('ATTEMPT_STATE', { status: current?.status })
	const p = await loadParts(ctx, attempt.id)
	for (const g of input.grades) {
		const aq = p.aqs.find((x) => x.id === g.attemptQuestionId)
		const q = aq && p.questions.get(aq.questionId)
		if (!aq || !q) return fail.notFound('ATTEMPT_QUESTION_NOT_FOUND')
		if (!questionDef(q.type)?.manual) return fail.invalid('QUESTION_NOT_MANUAL')
		if (g.score < 0 || g.score > aq.points || !Number.isInteger(g.score * 2)) return fail.invalid('SCORE_INVALID')
		const feedback = g.feedback && !isEmptyDoc(g.feedback as never) ? g.feedback : null
		const values = {
			score: g.score,
			isCorrect: g.score >= aq.points,
			gradedByMemberId: ctx.member.id,
			feedback: feedback as never,
		}
		const existing = p.answers.get(aq.id)
		if (existing) await ctx.db.update(quizAnswers).set(values).where(eq(quizAnswers.attemptQuestionId, aq.id))
		else await ctx.db.insert(quizAnswers).values({ attemptQuestionId: aq.id, ...values }) // не ответил — оценка за пустой ответ
	}
	// итог: сумма всех оценок; когда оценены все ручные — попытка завершена
	const [sum] = await ctx.db
		.select({ total: sql<number>`coalesce(sum(${quizAnswers.score}), 0)::float8` })
		.from(quizAnswers)
		.where(sql`${quizAnswers.attemptQuestionId} in (select id from attempt_questions where attempt_id = ${attempt.id})`)
	const fresh = await loadParts(ctx, attempt.id)
	const pending = fresh.aqs.filter((aq) => {
		const q = fresh.questions.get(aq.questionId)
		return q && questionDef(q.type)?.manual && (fresh.answers.get(aq.id)?.score ?? null) === null
	})
	const total = Math.round((sum?.total ?? 0) * 100) / 100
	if (pending.length === 0) {
		let passScorePct = 60
		try {
			passScorePct = (await settingsOf(ctx, attempt.lessonId, attempt.blockKey)).passScorePct
		} catch {
			// блок убрали из урока — порог по умолчанию
		}
		const passed = attempt.maxScore > 0 && (total / attempt.maxScore) * 100 >= passScorePct
		await ctx.db
			.update(quizAttempts)
			.set({ status: 'graded', score: total, passed, gradedAt: ctx.now() })
			.where(eq(quizAttempts.id, attempt.id))
		await ctx.emit(quizGraded, {
			attemptId: attempt.id,
			enrollmentId: attempt.enrollmentId,
			lessonId: attempt.lessonId,
			passed,
		})
		await recordBlockResult(ctx, {
			enrollmentId: attempt.enrollmentId,
			lessonId: attempt.lessonId,
			blockKey: attempt.blockKey,
			done: passed,
		})
	} else await ctx.db.update(quizAttempts).set({ score: total }).where(eq(quizAttempts.id, attempt.id))
	await ctx.audit('assessments.attempt.graded', {
		entity: 'quiz-attempt',
		id: attempt.id,
		diff: { questions: input.grades.length, done: pending.length === 0 },
	})
	return getAttemptForReview(ctx, attempt.id)
}
