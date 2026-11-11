// Кабинет ученика (карточка 4.5): «Продолжить» и ближайшие сроки по действующим курсам. Доступ и сроки считаются при чтении
// (`courseStates` → `computeAccess`); закрытые курсы (истёк, отозван) в сводку не попадают — названия уроков не раскрываются.
import type { HomeDeadline, LearnHome } from '@dinastia/contracts/learning'
import type { SchoolCtx } from '#/kernel/context.ts'
import { courseCards } from '../courses/service.ts'
import { flatLessons } from './access.ts'
import { myEnrollments } from './service.ts'
import { type CourseState, courseStates, nextOf } from './state.ts'

/** Горизонт «Ближайших сроков» и их число (утверждено в 4.5). */
export const HOME_DEADLINE_DAYS = 14
export const HOME_DEADLINE_LIMIT = 10
const DAY_MS = 24 * 60 * 60 * 1000

/** Последний раз ученик открывал урок курса; null — ещё не открывал. */
const lastOpened = (s: CourseState) =>
	[...s.facts.values()].reduce<Date | null>((max, f) => (!max || f.openedAt > max ? f.openedAt : max), null)

export async function getMyHome(ctx: SchoolCtx): Promise<LearnHome> {
	const states = (await courseStates(ctx, await myEnrollments(ctx))).filter((s) => s.outline && !s.closed)
	const now = ctx.now()
	const titles = new Map(states.flatMap((s) => (s.outline ? flatLessons(s.outline) : []).map((l) => [l.id, l.title])))

	// «Продолжить»: курс с последним открытым уроком, без открытых — последнее зачисление
	const candidates = states
		.map((s) => ({ s, next: nextOf(s.access), opened: lastOpened(s) }))
		.filter((c) => c.next)
		.sort(
			(a, b) =>
				(b.opened?.getTime() ?? 0) - (a.opened?.getTime() ?? 0) ||
				b.s.enrollment.enrolledAt.getTime() - a.s.enrollment.enrolledAt.getTime(),
		)
	const top = candidates[0]
	const [card] = top ? await courseCards(ctx, [top.s.enrollment.courseId]) : []

	const horizon = new Date(now.getTime() + HOME_DEADLINE_DAYS * DAY_MS)
	const deadlines: HomeDeadline[] = states
		.flatMap((s) =>
			s.access.flatMap((a) =>
				a.dueAt && (a.status === 'available' || a.status === 'in_progress') && (a.overdue || a.dueAt <= horizon)
					? [
							{
								courseId: s.enrollment.courseId,
								courseTitle: s.outline?.course.title ?? '',
								lessonId: a.lessonId,
								lessonTitle: titles.get(a.lessonId) ?? '',
								dueAt: a.dueAt,
								overdue: a.overdue,
							},
						]
					: [],
			),
		)
		.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
		.slice(0, HOME_DEADLINE_LIMIT)

	return {
		continue:
			top?.next && top.s.outline
				? {
						courseId: top.s.enrollment.courseId,
						courseTitle: top.s.outline.course.title,
						coverUrl: card?.coverUrl ?? null,
						progressPct: top.s.enrollment.progressPct,
						lessonId: top.next.lessonId,
						lessonTitle: titles.get(top.next.lessonId) ?? '',
					}
				: null,
		deadlines,
	}
}
