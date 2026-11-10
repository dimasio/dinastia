// Напоминания о сроках сдачи (карточка 4.4): раз в день по каждой школе — ученикам действующих зачислений «завтра срок»
// (срок в ближайшие сутки) и «срок прошёл» (просрочен не больше 3 дней назад), каждое один раз на урок. Отметка в
// `deadline_reminders` — в той же транзакции, что и постановка письма. Курсы — только те, где у уроков есть сроки.
import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx } from '#/kernel/context.ts'
import { members } from '#/kernel/members/schema.ts'
import { lessons } from '../courses/schema.ts'
import { publishedOutline } from '../courses/service.ts'
import { computeAccess, flatLessons, type ProgressFact } from './access.ts'
import { deadlineReminderEmail } from './emails/deadline-reminder.tsx'
import { deadlineReminders, enrollments, groups, lessonProgress } from './schema.ts'

const HOUR_MS = 60 * 60 * 1000
/** «Срок прошёл» — только по свежим просрочкам: новый срок в прошлом не рассылает писем по старым урокам. */
const OVERDUE_WINDOW_MS = 3 * 24 * HOUR_MS

export async function sendDeadlineReminders(ctx: BaseCtx): Promise<number> {
	const now = ctx.now()
	const courseRows = await ctx.db
		.selectDistinct({ courseId: lessons.courseId })
		.from(lessons)
		.where(and(isNotNull(lessons.publishedAt), or(isNotNull(lessons.deadlineDays), isNotNull(lessons.deadlineDate))))
	let sent = 0
	for (const { courseId } of courseRows) sent += await remindCourse(ctx, courseId, now)
	return sent
}

async function remindCourse(ctx: BaseCtx, courseId: string, now: Date): Promise<number> {
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
	const [progress, already] = await Promise.all([
		ctx.db.select().from(lessonProgress).where(inArray(lessonProgress.enrollmentId, ids)),
		ctx.db.select().from(deadlineReminders).where(inArray(deadlineReminders.enrollmentId, ids)),
	])
	const factsOf = new Map<string, Map<string, ProgressFact>>()
	for (const p of progress) {
		const m = factsOf.get(p.enrollmentId) ?? new Map<string, ProgressFact>()
		m.set(p.lessonId, { openedAt: p.openedAt, completedAt: p.completedAt })
		factsOf.set(p.enrollmentId, m)
	}
	const done = new Set(already.map((r) => `${r.enrollmentId}:${r.lessonId}:${r.kind}`))
	const titles = new Map(flatLessons(outline).map((l) => [l.id, l.title]))
	let sent = 0
	for (const { enrollment, email, groupStartsAt } of rows) {
		const access = computeAccess(
			outline,
			{ enrolledAt: enrollment.enrolledAt, groupStartsAt },
			factsOf.get(enrollment.id) ?? new Map(),
			now,
		)
		for (const a of access) {
			// без срока, пройден или ещё не открыт по расписанию — не напоминаем
			if (!a.dueAt || a.status === 'completed' || a.lockedBy?.kind === 'date') continue
			const left = a.dueAt.getTime() - now.getTime()
			const kind =
				left > 0 && left <= 24 * HOUR_MS ? 'soon' : left <= 0 && -left <= OVERDUE_WINDOW_MS ? 'overdue' : null
			if (!kind || done.has(`${enrollment.id}:${a.lessonId}:${kind}`)) continue
			const [mark] = await ctx.db
				.insert(deadlineReminders)
				.values({ enrollmentId: enrollment.id, lessonId: a.lessonId, kind, sentAt: now })
				.onConflictDoNothing()
				.returning({ id: deadlineReminders.id })
			if (!mark) continue
			await ctx.mail.send(deadlineReminderEmail, {
				to: email,
				data: {
					kind,
					courseTitle: outline.course.title,
					lessonTitle: titles.get(a.lessonId) ?? '',
					dueAt: a.dueAt.toISOString(),
					url: `${appOrigin(ctx.school.slug)}/learn/courses/${courseId}/lessons/${a.lessonId}`,
				},
			})
			sent++
		}
	}
	return sent
}
