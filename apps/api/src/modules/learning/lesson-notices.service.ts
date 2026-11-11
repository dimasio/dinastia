// Письма «открылись новые уроки» (карточка 4.8): раз в день по каждой школе — ученикам действующих зачислений про уроки по
// расписанию, которые открылись с прошлого письма. Только уроки, закрытые на момент зачисления (открытые сразу — без письма),
// и только свежие (не старше 3 дней: новое расписание в прошлом не рассылает писем по старым урокам). Одно письмо на курс;
// отметка `lesson_open_notices` — в той же транзакции, что и постановка письма.
import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx } from '#/kernel/context.ts'
import { members } from '#/kernel/members/schema.ts'
import { lessons } from '../courses/schema.ts'
import { publishedOutline } from '../courses/service.ts'
import { computeAccess, flatLessons, type ProgressFact } from './access.ts'
import { lessonsOpenedEmail } from './emails/lessons-opened.tsx'
import { enrollments, groups, lessonOpenNotices, lessonProgress } from './schema.ts'

const FRESH_MS = 3 * 24 * 60 * 60 * 1000

export async function sendLessonOpenedNotices(ctx: BaseCtx): Promise<number> {
	const now = ctx.now()
	const courseRows = await ctx.db
		.selectDistinct({ courseId: lessons.courseId })
		.from(lessons)
		.where(and(isNotNull(lessons.publishedAt), or(isNotNull(lessons.dripDays), isNotNull(lessons.dripDate))))
	let sent = 0
	for (const { courseId } of courseRows) sent += await noticeCourse(ctx, courseId, now)
	return sent
}

async function noticeCourse(ctx: BaseCtx, courseId: string, now: Date): Promise<number> {
	const outline = await publishedOutline(ctx, courseId)
	if (!outline) return 0
	const rows = await ctx.db
		.select({ enrollment: enrollments, email: users.email, groupStartsAt: groups.startsAt })
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.leftJoin(groups, eq(groups.id, enrollments.groupId))
		.where(
			and(
				eq(enrollments.courseId, courseId),
				eq(enrollments.status, 'active'),
				eq(members.status, 'active'),
				or(isNull(enrollments.expiresAt), gt(enrollments.expiresAt, now)),
			),
		)
	if (!rows.length) return 0
	const ids = rows.map((r) => r.enrollment.id)
	const progress = await ctx.db.select().from(lessonProgress).where(inArray(lessonProgress.enrollmentId, ids))
	const already = await ctx.db.select().from(lessonOpenNotices).where(inArray(lessonOpenNotices.enrollmentId, ids))
	const factsOf = new Map<string, Map<string, ProgressFact>>()
	for (const p of progress) {
		const m = factsOf.get(p.enrollmentId) ?? new Map<string, ProgressFact>()
		m.set(p.lessonId, { openedAt: p.openedAt, completedAt: p.completedAt })
		factsOf.set(p.enrollmentId, m)
	}
	const done = new Set(already.map((r) => `${r.enrollmentId}:${r.lessonId}`))
	const titles = new Map(flatLessons(outline).map((l) => [l.id, l.title]))
	let sent = 0
	for (const { enrollment, email, groupStartsAt } of rows) {
		const access = computeAccess(
			outline,
			{ enrolledAt: enrollment.enrolledAt, groupStartsAt },
			factsOf.get(enrollment.id) ?? new Map(),
			now,
		)
		const opened = access.filter(
			(a) =>
				a.opensAt &&
				a.opensAt <= now &&
				a.opensAt > enrollment.enrolledAt &&
				now.getTime() - a.opensAt.getTime() <= FRESH_MS &&
				!a.lockedBy &&
				a.status !== 'completed' &&
				!done.has(`${enrollment.id}:${a.lessonId}`),
		)
		if (!opened.length) continue
		const marked = await ctx.db
			.insert(lessonOpenNotices)
			.values(opened.map((a) => ({ enrollmentId: enrollment.id, lessonId: a.lessonId, sentAt: now })))
			.onConflictDoNothing()
			.returning({ lessonId: lessonOpenNotices.lessonId })
		if (!marked.length) continue
		const fresh = new Set(marked.map((m) => m.lessonId))
		await ctx.mail.send(lessonsOpenedEmail, {
			to: email,
			data: {
				courseTitle: outline.course.title,
				lessons: opened.filter((a) => fresh.has(a.lessonId)).map((a) => titles.get(a.lessonId) ?? ''),
				url: `${appOrigin(ctx.school.slug)}/learn/courses/${courseId}`,
			},
		})
		sent++
	}
	return sent
}
