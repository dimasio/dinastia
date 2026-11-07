// Ученик и прогресс (скилл lms-learners, карточка 2.6): зачисление (внутреннее, без API — API в фазе 4), оглавление,
// урок, отметки прохождения. Курс и его уроки — только через публичный API модуля courses и ядро блоков.
import type { CourseOutline, LockedBy, MyCourse, PlayerLesson } from '@dinastia/contracts/learning'
import { and, eq, inArray } from 'drizzle-orm'
import { listPublicBlocks } from '#/kernel/blocks/blocks.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { courseCards, type PublishedOutline, publishedOutline } from '../courses/service.ts'
import { computeAccess, flatLessons, type LessonAccess, type ProgressFact } from './access.ts'
import { enrollmentCompleted, lessonCompleted } from './events.ts'
import { enrollments, lessonProgress } from './schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000
type Enrollment = typeof enrollments.$inferSelect

/**
 * Зачислить участника на курс (внутренняя функция: сид, тесты; экраны и API зачисления — фаза 4). Идемпотентно:
 * действующее зачисление возвращается как есть. Курс — опубликованный; срок доступа — из `courses.access_days`.
 */
export async function enrollMember(
	ctx: BaseCtx,
	input: { memberId: string; courseId: string; source?: Enrollment['source'] },
): Promise<Enrollment> {
	const outline = await publishedOutline(ctx, input.courseId)
	if (!outline) return fail.notFound('COURSE_NOT_FOUND')
	if (outline.course.status !== 'published') return fail.conflict('COURSE_NOT_PUBLISHED')
	const [existing] = await ctx.db
		.select()
		.from(enrollments)
		.where(
			and(
				eq(enrollments.memberId, input.memberId),
				eq(enrollments.courseId, input.courseId),
				inArray(enrollments.status, ['active', 'completed']),
			),
		)
	if (existing) return existing
	const enrolledAt = ctx.now()
	const [row] = await ctx.db
		.insert(enrollments)
		.values({
			memberId: input.memberId,
			courseId: input.courseId,
			source: input.source ?? 'manual',
			enrolledAt,
			expiresAt: outline.course.accessDays ? new Date(enrolledAt.getTime() + outline.course.accessDays * DAY_MS) : null,
		})
		.returning()
	return row as Enrollment
}

/** Доступ закончился: срок вышел или зачисление помечено истёкшим. */
const isExpired = (e: Enrollment, now: Date) => e.status === 'expired' || (e.expiresAt !== null && e.expiresAt <= now)

async function factsOf(ctx: BaseCtx, enrollmentId: string): Promise<Map<string, ProgressFact>> {
	const rows = await ctx.db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentId))
	return new Map(rows.map((r) => [r.lessonId, { openedAt: r.openedAt, completedAt: r.completedAt }]))
}

const myEnrollments = (ctx: SchoolCtx) =>
	ctx.db
		.select()
		.from(enrollments)
		.where(
			and(eq(enrollments.memberId, ctx.member.id), inArray(enrollments.status, ['active', 'completed', 'expired'])),
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
		return card ? [{ ...card, progressPct: e.progressPct, expired: isExpired(e, now) }] : []
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
	}
	// доступ закончился — оглавление не отдаём (названия уроков платные)
	if (expired) return { course, sections: [], nextLessonId: null }
	const access = computeAccess(outline, enrollment, await factsOf(ctx, enrollment.id), ctx.now())
	const byId = new Map(access.map((a) => [a.lessonId, a]))
	return {
		course,
		sections: outline.sections.map((s) => ({
			id: s.id,
			title: s.title,
			lessons: s.lessons.map((l) => {
				const a = byId.get(l.id) as LessonAccess
				return { id: l.id, title: l.title, status: a.status, lockedBy: a.status === 'locked' ? a.lockedBy : null }
			}),
		})),
		nextLessonId: nextOf(access)?.lessonId ?? null,
	}
}

/** Курс урока для ученика: оглавление, зачисление, доступ к уроку; закрытый — LESSON_LOCKED. */
async function openLessonContext(ctx: SchoolCtx, lessonId: string) {
	const mine = await myEnrollments(ctx)
	for (const enrollment of mine) {
		const outline = await publishedOutline(ctx, enrollment.courseId)
		const lesson = outline && flatLessons(outline).find((l) => l.id === lessonId)
		if (!outline || !lesson) continue
		if (isExpired(enrollment, ctx.now())) return fail.forbidden('ENROLLMENT_EXPIRED')
		const facts = await factsOf(ctx, enrollment.id)
		const access = computeAccess(outline, enrollment, facts, ctx.now())
		const mineAccess = access.find((a) => a.lessonId === lessonId) as LessonAccess
		if (mineAccess.status === 'locked')
			return fail.forbidden('LESSON_LOCKED', { lockedBy: mineAccess.lockedBy as LockedBy })
		return { outline, enrollment, lesson, access, facts, status: mineAccess.status }
	}
	return fail.notFound('LESSON_NOT_FOUND')
}

export async function getMyLesson(ctx: SchoolCtx, lessonId: string): Promise<PlayerLesson> {
	const { outline, lesson, access, status } = await openLessonContext(ctx, lessonId)
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

async function markCompleted(
	ctx: SchoolCtx,
	c: Awaited<ReturnType<typeof openLessonContext>>,
	lessonId: string,
): Promise<{ status: 'completed'; progressPct: number }> {
	const fact = c.facts.get(lessonId)
	if (!fact?.completedAt) {
		await ctx.db
			.update(lessonProgress)
			.set({ completedAt: ctx.now() })
			.where(and(eq(lessonProgress.enrollmentId, c.enrollment.id), eq(lessonProgress.lessonId, lessonId)))
		await ctx.emit(lessonCompleted, { enrollmentId: c.enrollment.id, lessonId, courseId: c.outline.course.id })
	}
	return { status: 'completed', progressPct: await recalcProgress(ctx, c.enrollment, c.outline) }
}

/** Открыл урок: фиксируем первый вход; правило `view` и `all_blocks` (пока нет блоков с ответами) — завершает сразу. */
export async function openLesson(ctx: SchoolCtx, lessonId: string) {
	const c = await openLessonContext(ctx, lessonId)
	if (!c.facts.has(lessonId)) {
		await ctx.db
			.insert(lessonProgress)
			.values({ enrollmentId: c.enrollment.id, lessonId, openedAt: ctx.now() })
			.onConflictDoNothing()
		c.facts.set(lessonId, { openedAt: ctx.now(), completedAt: null })
	}
	if (c.lesson.completionRule !== 'manual') return markCompleted(ctx, c, lessonId)
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
