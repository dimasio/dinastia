// Прохождение теста (скилл lms-assessments, карточка 3.3): состояние, старт со снимком, ответы, сдача и проверка на
// сервере, результат по правилу показа ответов, автосдача по таймеру. Доступ ученика к уроку — модуль learning.
import type { AttemptResult, AttemptSummary, AttemptView, QuizState } from '@dinastia/contracts/assessments'
import { questions } from '@dinastia/db'
import { questionDef } from '@dinastia/questions'
import { and, asc, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm'
import { listBlocks } from '#/kernel/blocks/blocks.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import {
	getQuestions,
	gradeAnswer,
	publicQuestion,
	reviewQuestion,
	type StoredQuestion,
} from '#/kernel/questions/questions.ts'
import { enrollments } from '../learning/schema.ts'
import { openLessonContext } from '../learning/service.ts'
import { type AnswerRows, decodeResponse, encodeResponse } from './answers.ts'
import { quizGraded, quizSubmitted } from './events.ts'
import { resolveCurrent } from './question.service.ts'
import {
	attemptQuestionItems,
	attemptQuestions,
	questionTagLinks,
	quizAnswerItems,
	quizAnswers,
	quizAttempts,
} from './schema.ts'

type Attempt = typeof quizAttempts.$inferSelect

/** Данные опубликованного блока `quiz` (поля — как в `packages/blocks/src/quiz/definition.ts`). */
interface QuizSettings {
	selection: 'fixed' | 'random_by_tags'
	randomCount: number
	attemptsLimit: number
	passScorePct: number
	timeLimitSec: number | null
	shuffleQuestions: boolean
	shuffleOptions: boolean
	showCorrect: 'never' | 'after_submit' | 'after_pass'
	questions: { questionId: string }[]
	tags: { tagId: string }[]
}

/** Виды элементов, которые перемешиваются всегда: порядок их хранения — это и есть верный ответ. */
const ALWAYS_SHUFFLED = new Set(['order_item', 'match_right'])

const shuffleArray = <T>(items: readonly T[]): T[] => {
	const a = [...items]
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[a[i], a[j]] = [a[j] as T, a[i] as T]
	}
	return a
}

/** Настройки опубликованного блока урока по `block_key`; нет — QUIZ_NOT_FOUND. */
async function settingsOf(ctx: BaseCtx, lessonId: string, blockKey: string): Promise<QuizSettings> {
	const block = (await listBlocks(ctx, lessonId, 'published')).find((b) => b.blockKey === blockKey && b.type === 'quiz')
	if (!block) return fail.notFound('QUIZ_NOT_FOUND')
	return block.data as unknown as QuizSettings
}

const summary = (a: Attempt): AttemptSummary => ({
	id: a.id,
	status: a.status,
	score: a.score,
	maxScore: a.maxScore,
	passed: a.passed,
	startedAt: a.startedAt,
	deadlineAt: a.deadlineAt,
	submittedAt: a.submittedAt,
})

/** Попытка текущего участника; чужая и несуществующая не различаются. */
async function ownAttempt(ctx: SchoolCtx, attemptId: string): Promise<Attempt> {
	const [row] = await ctx.db
		.select({ attempt: quizAttempts })
		.from(quizAttempts)
		.innerJoin(enrollments, eq(enrollments.id, quizAttempts.enrollmentId))
		.where(and(eq(quizAttempts.id, attemptId), eq(enrollments.memberId, ctx.member.id)))
		.limit(1)
	return row?.attempt ?? fail.notFound('ATTEMPT_NOT_FOUND')
}

const expired = (a: Attempt, now: Date) => a.deadlineAt !== null && a.deadlineAt <= now

// ── Состояние ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function getQuizState(ctx: SchoolCtx, input: { lessonId: string; blockKey: string }): Promise<QuizState> {
	const c = await openLessonContext(ctx, input.lessonId)
	const settings = await settingsOf(ctx, input.lessonId, input.blockKey)
	await expireDue(ctx, c.enrollment.id, input)
	const attempts = await ctx.db
		.select()
		.from(quizAttempts)
		.where(
			and(
				eq(quizAttempts.enrollmentId, c.enrollment.id),
				eq(quizAttempts.lessonId, input.lessonId),
				eq(quizAttempts.blockKey, input.blockKey),
			),
		)
		.orderBy(desc(quizAttempts.startedAt), desc(quizAttempts.id))
	const active = attempts.find((a) => a.status === 'in_progress')
	const finished = attempts.filter((a) => a.status !== 'in_progress' && a.maxScore > 0)
	const best = finished.sort((a, b) => b.score / b.maxScore - a.score / a.maxScore)[0]
	return {
		settings: {
			selection: settings.selection,
			questionsCount: settings.selection === 'fixed' ? settings.questions.length : settings.randomCount,
			attemptsLimit: settings.attemptsLimit,
			passScorePct: settings.passScorePct,
			timeLimitSec: settings.timeLimitSec,
			showCorrect: settings.showCorrect,
		},
		attempts: attempts.map(summary),
		activeAttemptId: active?.id ?? null,
		canStart: !active && (settings.attemptsLimit === 0 || attempts.length < settings.attemptsLimit),
		best: best ? { score: best.score, maxScore: best.maxScore } : null,
	}
}

/** Просроченные попытки этого блока сдаются при обращении — не дожидаясь задачи. */
async function expireDue(ctx: SchoolCtx, enrollmentId: string, ref: { lessonId: string; blockKey: string }) {
	const due = await ctx.db
		.select()
		.from(quizAttempts)
		.where(
			and(
				eq(quizAttempts.enrollmentId, enrollmentId),
				eq(quizAttempts.lessonId, ref.lessonId),
				eq(quizAttempts.blockKey, ref.blockKey),
				eq(quizAttempts.status, 'in_progress'),
			),
		)
	for (const a of due) if (expired(a, ctx.now())) await finalizeAttempt(ctx, a.id)
}

// ── Старт со снимком ───────────────────────────────────────────────────────────────────────────────────────────

/** Вопросы попытки: фиксированный список (текущие ревизии, архивные пропущены) или случайные по тегам. */
async function pickQuestions(ctx: BaseCtx, courseId: string, settings: QuizSettings): Promise<StoredQuestion[]> {
	let ids: string[]
	if (settings.selection === 'fixed') {
		const resolved = await resolveCurrent(
			ctx,
			settings.questions.map((q) => q.questionId),
		)
		ids = [...new Set([...resolved.values()].flatMap((r) => (r ? [r.id] : [])))]
		// порядок автора
		const order = new Map(settings.questions.map((q, i) => [resolved.get(q.questionId)?.id, i]))
		ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
	} else {
		const tagIds = settings.tags.map((t) => t.tagId)
		const pool = tagIds.length
			? await ctx.db
					.select({ id: questions.id })
					.from(questions)
					.where(
						and(
							eq(questions.courseId, courseId),
							eq(questions.isCurrent, true),
							isNull(questions.archivedAt),
							exists(
								ctx.db
									.select({ one: sql`1` })
									.from(questionTagLinks)
									.where(and(eq(questionTagLinks.questionId, questions.id), inArray(questionTagLinks.tagId, tagIds))),
							),
						),
					)
			: []
		ids = shuffleArray(pool.map((p) => p.id)).slice(0, settings.randomCount)
	}
	if (!ids.length) return fail.conflict('QUIZ_EMPTY')
	const byId = new Map((await getQuestions(ctx, ids)).map((q) => [q.id, q]))
	const list = ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as StoredQuestion] : []))
	return settings.shuffleQuestions ? shuffleArray(list) : list
}

export async function startAttempt(
	ctx: SchoolCtx,
	input: { lessonId: string; blockKey: string },
): Promise<AttemptView> {
	const c = await openLessonContext(ctx, input.lessonId)
	const settings = await settingsOf(ctx, input.lessonId, input.blockKey)
	// блокировка зачисления: два одновременных старта не обойдут лимит попыток
	await ctx.db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.id, c.enrollment.id)).for('update')
	await expireDue(ctx, c.enrollment.id, input)
	const attempts = await ctx.db
		.select()
		.from(quizAttempts)
		.where(
			and(
				eq(quizAttempts.enrollmentId, c.enrollment.id),
				eq(quizAttempts.lessonId, input.lessonId),
				eq(quizAttempts.blockKey, input.blockKey),
			),
		)
	const active = attempts.find((a) => a.status === 'in_progress')
	if (active) return attemptView(ctx, active)
	if (settings.attemptsLimit > 0 && attempts.length >= settings.attemptsLimit)
		return fail.conflict('ATTEMPTS_EXHAUSTED')

	const picked = await pickQuestions(ctx, c.outline.course.id, settings)
	const now = ctx.now()
	const [attempt] = await ctx.db
		.insert(quizAttempts)
		.values({
			enrollmentId: c.enrollment.id,
			lessonId: input.lessonId,
			blockKey: input.blockKey,
			maxScore: picked.reduce((n, q) => n + (q.data.points as number), 0),
			startedAt: now,
			deadlineAt: settings.timeLimitSec ? new Date(now.getTime() + settings.timeLimitSec * 1000) : null,
		})
		.returning()
	if (!attempt) throw new Error('попытка не создана')
	const rows = await ctx.db
		.insert(attemptQuestions)
		.values(
			picked.map((q, i) => ({ attemptId: attempt.id, questionId: q.id, position: i, points: q.data.points as number })),
		)
		.returning()
	// порядок элементов: перемешанные виды — по случайной перестановке, остальные у «опциональных» типов — как хранятся
	const itemRows = rows.flatMap((aq, i) => {
		const q = picked[i] as StoredQuestion
		const def = questionDef(q.type)
		if (def?.shuffle !== 'items') return []
		return Object.entries(def.items ?? {}).flatMap(([field, kind]) => {
			const items = (q.data[field] as { id: string }[] | undefined) ?? []
			const mix = ALWAYS_SHUFFLED.has(kind) || (kind === 'option' && settings.shuffleOptions)
			if (!mix) return []
			return shuffleArray(items).map((item, position) => ({ attemptQuestionId: aq.id, itemId: item.id, position }))
		})
	})
	if (itemRows.length) await ctx.db.insert(attemptQuestionItems).values(itemRows)
	return attemptView(ctx, attempt)
}

// ── Просмотр попытки ───────────────────────────────────────────────────────────────────────────────────────────

interface Parts {
	aqs: (typeof attemptQuestions.$inferSelect)[]
	questions: Map<string, StoredQuestion>
	order: Map<string, Map<string, number>>
	answers: Map<string, AnswerRows & { score: number | null; isCorrect: boolean | null }>
}

async function loadParts(ctx: BaseCtx, attemptId: string): Promise<Parts> {
	const aqs = await ctx.db
		.select()
		.from(attemptQuestions)
		.where(eq(attemptQuestions.attemptId, attemptId))
		.orderBy(asc(attemptQuestions.position))
	const aqIds = aqs.map((a) => a.id)
	const [qs, orderRows, answerRows] = await Promise.all([
		getQuestions(
			ctx,
			aqs.map((a) => a.questionId),
		),
		aqIds.length
			? ctx.db.select().from(attemptQuestionItems).where(inArray(attemptQuestionItems.attemptQuestionId, aqIds))
			: [],
		aqIds.length ? ctx.db.select().from(quizAnswers).where(inArray(quizAnswers.attemptQuestionId, aqIds)) : [],
	])
	const answerIds = answerRows.map((a) => a.id)
	const itemRows = answerIds.length
		? await ctx.db.select().from(quizAnswerItems).where(inArray(quizAnswerItems.answerId, answerIds))
		: []
	const order = new Map<string, Map<string, number>>()
	for (const r of orderRows) {
		const m = order.get(r.attemptQuestionId) ?? new Map<string, number>()
		m.set(r.itemId, r.position)
		order.set(r.attemptQuestionId, m)
	}
	const answers = new Map(
		answerRows.map((a) => [
			a.attemptQuestionId,
			{
				textValue: a.textValue,
				numberValue: a.numberValue,
				score: a.score,
				isCorrect: a.isCorrect,
				items: itemRows
					.filter((i) => i.answerId === a.id)
					.map((i) => ({ itemId: i.itemId, position: i.position, matchedItemId: i.matchedItemId })),
			},
		]),
	)
	return { aqs, questions: new Map(qs.map((q) => [q.id, q])), order, answers }
}

/** Вопрос ученику: `toPublic` типа, элементы — в порядке снимка попытки. */
function publicInAttempt(q: StoredQuestion, order: Map<string, number> | undefined): unknown {
	const pub = publicQuestion(q) as Record<string, unknown>
	const def = questionDef(q.type)
	if (!order?.size || !def?.items) return pub
	const out = { ...pub }
	for (const field of Object.keys(def.items)) {
		const arr = out[field]
		if (Array.isArray(arr))
			out[field] = [...arr].sort(
				(a: { id: string }, b: { id: string }) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
			)
	}
	return out
}

async function attemptView(ctx: BaseCtx, attempt: Attempt): Promise<AttemptView> {
	const p = await loadParts(ctx, attempt.id)
	const questionsOut = p.aqs.flatMap((aq) => {
		const q = p.questions.get(aq.questionId)
		const def = q ? questionDef(q.type) : undefined
		if (!q || !def) return []
		const rows = p.answers.get(aq.id) ?? null
		return [
			{
				id: aq.id,
				type: q.type,
				points: aq.points,
				data: publicInAttempt(q, p.order.get(aq.id)),
				response: decodeResponse(def, rows),
			},
		]
	})
	return {
		attempt: summary(attempt),
		questions: questionsOut,
		answered: questionsOut.filter((x) => x.response !== null).length,
	}
}

export async function getAttempt(ctx: SchoolCtx, attemptId: string): Promise<AttemptView> {
	let attempt = await ownAttempt(ctx, attemptId)
	if (attempt.status === 'in_progress' && expired(attempt, ctx.now())) {
		await finalizeAttempt(ctx, attemptId)
		attempt = await ownAttempt(ctx, attemptId)
	}
	return attemptView(ctx, attempt)
}

// ── Ответ ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function saveAnswer(
	ctx: SchoolCtx,
	input: { attemptId: string; attemptQuestionId: string; response: unknown },
) {
	const attempt = await ownAttempt(ctx, input.attemptId)
	if (attempt.status !== 'in_progress') return fail.conflict('ATTEMPT_NOT_ACTIVE')
	if (expired(attempt, ctx.now())) return fail.conflict('ATTEMPT_EXPIRED')
	const [aq] = await ctx.db
		.select()
		.from(attemptQuestions)
		.where(and(eq(attemptQuestions.id, input.attemptQuestionId), eq(attemptQuestions.attemptId, attempt.id)))
	if (!aq) return fail.notFound('ATTEMPT_QUESTION_NOT_FOUND')
	const [existing] = await ctx.db.select().from(quizAnswers).where(eq(quizAnswers.attemptQuestionId, aq.id))
	if (input.response === null) {
		if (existing) await ctx.db.delete(quizAnswers).where(eq(quizAnswers.id, existing.id))
		return { ok: true as const }
	}
	const [q] = await getQuestions(ctx, [aq.questionId])
	const def = q && questionDef(q.type)
	if (!q || !def) return fail.notFound('QUESTION_NOT_FOUND')
	const parsed = def.responseSchema.parse(input.response) // ZodError → 400
	const allowed = new Set(
		Object.keys(def.items ?? {}).flatMap((f) => ((q.data[f] as { id: string }[] | undefined) ?? []).map((i) => i.id)),
	)
	const rows = encodeResponse(def, parsed, allowed)
	let answerId = existing?.id
	if (answerId)
		await ctx.db
			.update(quizAnswers)
			.set({
				textValue: rows.textValue,
				numberValue: rows.numberValue,
				answeredAt: ctx.now(),
				score: null,
				isCorrect: null,
			})
			.where(eq(quizAnswers.id, answerId))
	else {
		const [created] = await ctx.db
			.insert(quizAnswers)
			.values({
				attemptQuestionId: aq.id,
				textValue: rows.textValue,
				numberValue: rows.numberValue,
				answeredAt: ctx.now(),
			})
			.returning({ id: quizAnswers.id })
		answerId = created?.id
	}
	if (!answerId) throw new Error('ответ не сохранён')
	await ctx.db.delete(quizAnswerItems).where(eq(quizAnswerItems.answerId, answerId))
	if (rows.items.length)
		await ctx.db.insert(quizAnswerItems).values(rows.items.map((i) => ({ answerId: answerId as string, ...i })))
	return { ok: true as const }
}

// ── Сдача и проверка ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Сдать попытку (вручную, после срока или автосдачей): проверить каждый вопрос на сервере, посчитать баллы, поставить
 * статус и событие. Неотвеченный вопрос — 0 баллов; `open_text` — попытка `submitted` до ручной проверки (3.6).
 */
export async function finalizeAttempt(ctx: BaseCtx, attemptId: string) {
	const [attempt] = await ctx.db.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).for('update')
	if (!attempt) return attempt
	if (attempt.status !== 'in_progress') return attempt
	const p = await loadParts(ctx, attemptId)
	let score = 0
	let manual = false
	for (const aq of p.aqs) {
		const q = p.questions.get(aq.questionId)
		const def = q ? questionDef(q.type) : undefined
		if (!q || !def) continue
		const rows = p.answers.get(aq.id) ?? null
		let result: { score: number; isCorrect: boolean } | null
		if (def.manual) {
			manual = true
			result = null
		} else if (!rows) result = { score: 0, isCorrect: false }
		else result = gradeAnswer(q, decodeResponse(def, rows))
		if (result) score += result.score
		const values = { score: result?.score ?? null, isCorrect: result?.isCorrect ?? null }
		if (rows) await ctx.db.update(quizAnswers).set(values).where(eq(quizAnswers.attemptQuestionId, aq.id))
		else if (!def.manual) await ctx.db.insert(quizAnswers).values({ attemptQuestionId: aq.id, ...values })
	}
	const now = ctx.now()
	let passScorePct = 60
	try {
		passScorePct = (await settingsOf(ctx, attempt.lessonId, attempt.blockKey)).passScorePct
	} catch {
		// блок убрали из урока — оцениваем по значению по умолчанию
	}
	const total = Math.round(score * 100) / 100
	const passed = manual ? null : attempt.maxScore > 0 && (total / attempt.maxScore) * 100 >= passScorePct
	const [done] = await ctx.db
		.update(quizAttempts)
		.set({
			status: manual ? 'submitted' : 'graded',
			score: total,
			passed,
			submittedAt: now,
			gradedAt: manual ? null : now,
		})
		.where(eq(quizAttempts.id, attemptId))
		.returning()
	const ids = { attemptId, enrollmentId: attempt.enrollmentId, lessonId: attempt.lessonId }
	await ctx.emit(quizSubmitted, ids)
	if (passed !== null) await ctx.emit(quizGraded, { ...ids, passed })
	return done
}

export async function submitAttempt(ctx: SchoolCtx, attemptId: string): Promise<AttemptResult> {
	const attempt = await ownAttempt(ctx, attemptId)
	if (attempt.status === 'in_progress') await finalizeAttempt(ctx, attemptId)
	return resultOf(ctx, attemptId)
}

// ── Результат ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function resultOf(ctx: SchoolCtx, attemptId: string): Promise<AttemptResult> {
	const attempt = await ownAttempt(ctx, attemptId)
	if (attempt.status === 'in_progress') return fail.conflict('ATTEMPT_NOT_FINISHED')
	let showCorrect: QuizSettings['showCorrect'] = 'never'
	try {
		showCorrect = (await settingsOf(ctx, attempt.lessonId, attempt.blockKey)).showCorrect
	} catch {
		// блок убрали из урока — подробности не показываем
	}
	const revealed = showCorrect === 'after_submit' || (showCorrect === 'after_pass' && attempt.passed === true)
	const pct = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0
	if (!revealed) return { attempt: summary(attempt), pct, revealed, questions: [] }
	const p = await loadParts(ctx, attemptId)
	const out = p.aqs.flatMap((aq) => {
		const q = p.questions.get(aq.questionId)
		const def = q ? questionDef(q.type) : undefined
		if (!q || !def) return []
		const rows = p.answers.get(aq.id) ?? null
		return [
			{
				id: aq.id,
				type: q.type,
				points: aq.points,
				data: publicInAttempt(q, p.order.get(aq.id)),
				response: decodeResponse(def, rows),
				score: rows?.score ?? null,
				isCorrect: rows?.isCorrect ?? null,
				review: reviewQuestion(q),
			},
		]
	})
	return { attempt: summary(attempt), pct, revealed, questions: out }
}
