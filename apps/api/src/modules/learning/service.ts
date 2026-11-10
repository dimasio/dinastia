// Ученик и прогресс (скилл lms-learners, карточки 2.6, 4.3): зачисление (внутреннее), оглавление, урок, отметки прохождения,
// пересчёт прогресса курса. Курс и его уроки — только через публичный API модуля courses и ядро блоков.

import { blockDef } from '@dinastia/blocks'
import type { CourseOutline, LockedBy, MyCourse, PlayerLesson } from '@dinastia/contracts/learning'
import { and, eq, inArray } from 'drizzle-orm'
import { listBlocks, listPublicBlocks } from '#/kernel/blocks/blocks.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { courseCards, type PublishedOutline, publishedOutline } from '../courses/service.ts'
import { computeAccess, flatLessons, type LessonAccess, type ProgressFact } from './access.ts'
import { enroll } from './enrollment.service.ts'
import { enrollmentCompleted, lessonCompleted } from './events.ts'
import { blockProgress, enrollments, groups, lessonProgress } from './schema.ts'

type Enrollment = typeof enrollments.$inferSelect

/** Зачислить участника на курс (внутренняя функция: сид, тесты, команда `enroll`); см. `enroll` в `enrollment.service.ts`. */
export async function enrollMember(
	ctx: BaseCtx,
	input: { memberId: string; courseId: string; source?: Enrollment['source'] },
): Promise<Enrollment> {
	return (await enroll(ctx, input)).enrollment
}

/** Доступ закончился: срок вышел или зачисление помечено истёкшим. */
const isExpired = (e: Enrollment, now: Date) => e.status === 'expired' || (e.expiresAt !== null && e.expiresAt <= now)

/** Зачисление для расчёта доступа: со стартом потока — «через N дней» считается от него (4.3). */
async function accessBase(ctx: BaseCtx, e: Enrollment) {
	if (!e.groupId) return { enrolledAt: e.enrolledAt, groupStartsAt: null }
	const [g] = await ctx.db.select({ startsAt: groups.startsAt }).from(groups).where(eq(groups.id, e.groupId))
	return { enrolledAt: e.enrolledAt, groupStartsAt: g?.startsAt ?? null }
}

async function factsOf(ctx: BaseCtx, enrollmentId: string): Promise<Map<string, ProgressFact>> {
	const rows = await ctx.db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentId))
	return new Map(rows.map((r) => [r.lessonId, { openedAt: r.openedAt, completedAt: r.completedAt }]))
}

const myEnrollments = (ctx: SchoolCtx) =>
	ctx.db
		.select()
		.from(enrollments)
		.where(
			and(
				eq(enrollments.memberId, ctx.member.id),
				inArray(enrollments.status, ['active', 'completed', 'expired', 'revoked']),
			),
		)

/** Мои курсы: зачисленные, кроме черновиков; истёкшие — с признаком. */
export async function listMyCourses(ctx: SchoolCtx): Promise<MyCourse[]> {
	const rows = await myEnrollments(ctx)
	const cards = new Map(
		(
			await courseCards(
				ctx,
				rows.map((r) => r.courseId),
			)
		).map((c) => [c.id, c]),
	)
	const now = ctx.now()
	return rows.flatMap((e) => {
		const card = cards.get(e.courseId)
		return card
			? [{ ...card, progressPct: e.progressPct, expired: isExpired(e, now), revoked: e.status === 'revoked' }]
			: []
	})
}

/** Зачисление участника на курс, который ему виден; иначе COURSE_NOT_FOUND (чужой и несуществующий не различаются). */
async function enrollmentOrFail(ctx: SchoolCtx, courseId: string) {
	const outline = await publishedOutline(ctx, courseId)
	const [enrollment] = await myEnrollments(ctx).then((rows) => rows.filter((r) => r.courseId === courseId))
	if (!outline || !enrollment) return fail.notFound('COURSE_NOT_FOUND')
	return { outline, enrollment }
}

const nextOf = (access: LessonAccess[]) => access.find((a) => a.status === 'available' || a.status === 'in_progress')

export async function getMyCourse(ctx: SchoolCtx, courseId: string): Promise<CourseOutline> {
	const { outline, enrollment } = await enrollmentOrFail(ctx, courseId)
	const [card] = await courseCards(ctx, [courseId])
	const expired = isExpired(enrollment, ctx.now())
	const course: MyCourse = {
		id: courseId,
		title: outline.course.title,
		slug: card?.slug ?? '',
		coverUrl: card?.coverUrl ?? null,
		progressPct: enrollment.progressPct,
		expired,
		revoked: enrollment.status === 'revoked',
	}
	// доступ закончился или отозван — оглавление не отдаём (названия уроков платные)
	if (expired || course.revoked) return { course, sections: [], nextLessonId: null }
	const access = computeAccess(outline, await accessBase(ctx, enrollment), await factsOf(ctx, enrollment.id), ctx.now())
	const byId = new Map(access.map((a) => [a.lessonId, a]))
	return {
		course,
		sections: outline.sections.map((s) => ({
			id: s.id,
			title: s.title,
			lessons: s.lessons.map((l) => {
				const a = byId.get(l.id) as LessonAccess
				return {
					id: l.id,
					title: l.title,
					status: a.status,
					lockedBy: a.status === 'locked' ? a.lockedBy : null,
					dueAt: a.dueAt,
					overdue: a.overdue,
				}
			}),
		})),
		nextLessonId: nextOf(access)?.lessonId ?? null,
	}
}

/** Курс урока для ученика: оглавление, зачисление, доступ к уроку; закрытый — LESSON_LOCKED. */
export async function openLessonContext(ctx: SchoolCtx, lessonId: string) {
	const mine = await myEnrollments(ctx)
	for (const enrollment of mine) {
		const outline = await publishedOutline(ctx, enrollment.courseId)
		const lesson = outline && flatLessons(outline).find((l) => l.id === lessonId)
		if (!outline || !lesson) continue
		if (enrollment.status === 'revoked') return fail.forbidden('ENROLLMENT_REVOKED')
		if (isExpired(enrollment, ctx.now())) return fail.forbidden('ENROLLMENT_EXPIRED')
		const facts = await factsOf(ctx, enrollment.id)
		const access = computeAccess(outline, await accessBase(ctx, enrollment), facts, ctx.now())
		const mineAccess = access.find((a) => a.lessonId === lessonId) as LessonAccess
		if (mineAccess.status === 'locked')
			return fail.forbidden('LESSON_LOCKED', { lockedBy: mineAccess.lockedBy as LockedBy })
		return { outline, enrollment, lesson, access, facts, status: mineAccess.status }
	}
	return fail.notFound('LESSON_NOT_FOUND')
}

export async function getMyLesson(ctx: SchoolCtx, lessonId: string): Promise<PlayerLesson> {
	const { outline, lesson, access, status } = await openLessonContext(ctx, lessonId)
	const mine = access.find((a) => a.lessonId === lessonId)
	const flat = flatLessons(outline)
	const i = flat.findIndex((l) => l.id === lessonId)
	const nav = (idx: number) => {
		const l = flat[idx]
		return l ? { id: l.id, title: l.title, locked: access[idx]?.status === 'locked' } : null
	}
	return {
		lesson: {
			id: lesson.id,
			courseId: outline.course.id,
			courseTitle: outline.course.title,
			title: lesson.title,
			completionRule: lesson.completionRule,
			status,
			dueAt: mine?.dueAt ?? null,
			overdue: mine?.overdue ?? false,
		},
		// секреты и черновик не уходят: только опубликованные строки через toPublic типа
		blocks: (await listPublicBlocks(ctx, lessonId)).map((b) => ({
			id: b.id,
			blockKey: b.blockKey,
			type: b.type,
			isRequired: b.isRequired,
			data: b.data,
			files: b.files,
		})),
		prev: nav(i - 1),
		next: nav(i + 1),
	}
}

/** Единственное место расчёта `progress_pct` и завершения курса (идемпотентно). */
async function recalcProgress(ctx: BaseCtx, enrollment: Enrollment, outline: PublishedOutline) {
	const facts = await factsOf(ctx, enrollment.id)
	const ids = flatLessons(outline).map((l) => l.id)
	const done = ids.filter((id) => facts.get(id)?.completedAt).length
	const pct = ids.length ? Math.round((done / ids.length) * 100) : 0
	const completes = enrollment.status === 'active' && ids.length > 0 && pct >= outline.course.completionThresholdPct
	await ctx.db
		.update(enrollments)
		.set({ progressPct: pct, ...(completes ? { status: 'completed', completedAt: ctx.now() } : {}) })
		.where(eq(enrollments.id, enrollment.id))
	if (completes) await ctx.emit(enrollmentCompleted, { enrollmentId: enrollment.id, courseId: outline.course.id })
	return pct
}

/**
 * Пересчитать прогресс всех учеников курса (4.3, задача `learning.recalc-course-progress`): после публикации и удаления уроков,
 * смены порога. Идемпотентно; пройденный курс остаётся пройденным, отозванные не трогаются.
 */
export async function recalcCourseProgress(ctx: BaseCtx, courseId: string): Promise<number> {
	const outline = await publishedOutline(ctx, courseId)
	if (!outline) return 0
	const rows = await ctx.db
		.select()
		.from(enrollments)
		.where(and(eq(enrollments.courseId, courseId), inArray(enrollments.status, ['active', 'completed', 'expired'])))
	for (const e of rows) await recalcProgress(ctx, e, outline)
	return rows.length
}

/** Завершить урок (идемпотентно): отметка, событие `lesson.completed` один раз, пересчёт прогресса курса. */
async function completeLessonFor(
	ctx: BaseCtx,
	enrollment: Enrollment,
	outline: PublishedOutline,
	lessonId: string,
	alreadyDone: boolean,
) {
	if (!alreadyDone) {
		await ctx.db
			.update(lessonProgress)
			.set({ completedAt: ctx.now() })
			.where(and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lessonId)))
		await ctx.emit(lessonCompleted, { enrollmentId: enrollment.id, lessonId, courseId: outline.course.id })
	}
	return recalcProgress(ctx, enrollment, outline)
}

async function markCompleted(
	ctx: SchoolCtx,
	c: Awaited<ReturnType<typeof openLessonContext>>,
	lessonId: string,
): Promise<{ status: 'completed'; progressPct: number }> {
	const progressPct = await completeLessonFor(
		ctx,
		c.enrollment,
		c.outline,
		lessonId,
		Boolean(c.facts.get(lessonId)?.completedAt),
	)
	return { status: 'completed', progressPct }
}

/** Блоки «оценки» опубликованной версии урока (`completion: 'grade'`: тест, задание) — ключи блоков. */
async function gradeBlockKeys(ctx: BaseCtx, lessonId: string): Promise<string[]> {
	const blocks = await listBlocks(ctx, lessonId, 'published')
	return blocks.filter((b) => blockDef(b.type)?.completion === 'grade').map((b) => b.blockKey)
}

/** Выполнены ли все блоки «оценки» урока (нет таких блоков — выполнены). */
async function gradeBlocksDone(ctx: BaseCtx, enrollmentId: string, lessonId: string): Promise<boolean> {
	const keys = await gradeBlockKeys(ctx, lessonId)
	if (!keys.length) return true
	const rows = await ctx.db
		.select({ blockKey: blockProgress.blockKey })
		.from(blockProgress)
		.where(
			and(
				eq(blockProgress.enrollmentId, enrollmentId),
				eq(blockProgress.lessonId, lessonId),
				eq(blockProgress.status, 'done'),
			),
		)
	const done = new Set(rows.map((r) => r.blockKey))
	return keys.every((k) => done.has(k))
}

/**
 * Результат блока «оценки» (тест сдан с зачётом, задание принято — `done: true`; попытка или работа без зачёта — `false`):
 * публичный вызов `learning` для `assessments`, в той же транзакции, что и решение. `done` не снимается. Затем урок с
 * правилом `all_blocks` пересчитывается и при выполнении всех блоков «оценки» завершается (карточка 3.6).
 */
export async function recordBlockResult(
	ctx: BaseCtx,
	input: { enrollmentId: string; lessonId: string; blockKey: string; done: boolean },
): Promise<void> {
	const now = ctx.now()
	const insert = ctx.db.insert(blockProgress).values({
		enrollmentId: input.enrollmentId,
		lessonId: input.lessonId,
		blockKey: input.blockKey,
		status: input.done ? 'done' : 'failed',
		completedAt: input.done ? now : null,
	})
	await (input.done
		? insert.onConflictDoUpdate({
				target: [blockProgress.schoolId, blockProgress.enrollmentId, blockProgress.lessonId, blockProgress.blockKey],
				set: { status: 'done', completedAt: now },
			})
		: insert.onConflictDoNothing())
	if (!input.done) return
	const [enrollment] = await ctx.db.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId))
	if (!enrollment || (enrollment.status !== 'active' && enrollment.status !== 'completed')) return
	const outline = await publishedOutline(ctx, enrollment.courseId)
	const lesson = outline && flatLessons(outline).find((l) => l.id === input.lessonId)
	if (!outline || !lesson || lesson.completionRule !== 'all_blocks') return
	const [fact] = await ctx.db
		.select()
		.from(lessonProgress)
		.where(and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, input.lessonId)))
	if (fact?.completedAt) return
	if (!fact)
		await ctx.db
			.insert(lessonProgress)
			.values({ enrollmentId: enrollment.id, lessonId: input.lessonId, openedAt: now })
			.onConflictDoNothing()
	if (await gradeBlocksDone(ctx, enrollment.id, input.lessonId))
		await completeLessonFor(ctx, enrollment, outline, input.lessonId, false)
}

/** Открыл урок: фиксируем первый вход; `view` завершает сразу, `all_blocks` — когда выполнены все блоки «оценки», `manual` — кнопкой. */
export async function openLesson(ctx: SchoolCtx, lessonId: string) {
	const c = await openLessonContext(ctx, lessonId)
	if (!c.facts.has(lessonId)) {
		await ctx.db
			.insert(lessonProgress)
			.values({ enrollmentId: c.enrollment.id, lessonId, openedAt: ctx.now() })
			.onConflictDoNothing()
		c.facts.set(lessonId, { openedAt: ctx.now(), completedAt: null })
	}
	const rule = c.lesson.completionRule
	if (rule === 'view' || (rule === 'all_blocks' && (await gradeBlocksDone(ctx, c.enrollment.id, lessonId))))
		return markCompleted(ctx, c, lessonId)
	return {
		status: c.facts.get(lessonId)?.completedAt ? ('completed' as const) : ('in_progress' as const),
		progressPct: c.enrollment.progressPct,
	}
}

export async function completeLesson(ctx: SchoolCtx, lessonId: string) {
	const c = await openLessonContext(ctx, lessonId)
	if (!c.facts.has(lessonId)) {
		await ctx.db
			.insert(lessonProgress)
			.values({ enrollmentId: c.enrollment.id, lessonId, openedAt: ctx.now() })
			.onConflictDoNothing()
	}
	return markCompleted(ctx, c, lessonId)
}
