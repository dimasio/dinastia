// Аналитика курса (карточка 4.6): сводка и воронка, просрочки, фильтр по потоку, область куратора, права; новые колонки
// «Учеников» и сортировка по последней активности.
import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { intoCuratorGroup } from './testing.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Курс из трёх уроков («при открытии», доступ сразу), у третьего — срок в прошлом. */
async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Аналитика' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Основы' })
	const lessons: { id: string }[] = []
	for (const title of ['Первый', 'Второй', 'Третий']) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc(title) } })
		await c.courses.lessons.update({ id: lesson.id, completionRule: 'view' })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.lessons.update({ id: lessons[2]?.id as string, deadlineDate: '2020-01-10' })
	await c.courses.update({ id: course.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: course.id })
	return { t, c, course, lessons }
}

const enroll = async (t: TestSchool, courseId: string, email: string) =>
	(await t.as('teacher').learning.enrollments.enroll({ courseId, email })).enrollment?.id as string

describe('аналитика курса', () => {
	it('сводка, воронка и просрочки; отозванные не считаются', async () => {
		const s = await setup()
		await enroll(s.t, s.course.id, s.t.people.student.email)
		const student = s.t.as('student')
		await student.learn.lessons.open({ lessonId: s.lessons[0]?.id as string })
		await student.learn.lessons.open({ lessonId: s.lessons[1]?.id as string })
		const a = await s.c.learning.analytics.course({ courseId: s.course.id })
		expect(a.summary).toEqual({
			learners: 1,
			learning: 1,
			completed: 0,
			expired: 0,
			avgProgressPct: 67,
			withOverdue: 1,
		})
		expect(a.lessons.map((l) => [l.title, l.sectionTitle, l.opened, l.completed, l.overdue])).toEqual([
			['Первый', 'Основы', 1, 1, 0],
			['Второй', 'Основы', 1, 1, 0],
			['Третий', 'Основы', 0, 0, 1],
		])
		const { items } = await s.c.learning.enrollments.list({ courseId: s.course.id })
		expect(items[0]).toMatchObject({ lessonsCompleted: 2, lessonsTotal: 3, overdueCount: 1 })
		expect(items[0]?.lastActivityAt).not.toBeNull()
		await s.c.learning.enrollments.revoke({ id: items[0]?.id as string })
		expect((await s.c.learning.analytics.course({ courseId: s.course.id })).summary.learners).toBe(0)
	})

	it('поток и куратор: фильтр по потоку, куратор видит только свои потоки; ученик — нет права', async () => {
		const s = await setup()
		await enroll(s.t, s.course.id, s.t.people.student.email)
		const curator = s.t.as('curator')
		expect((await curator.learning.analytics.course({ courseId: s.course.id })).summary.learners).toBe(0)
		const group = await intoCuratorGroup(s.t, s.course.id)
		expect((await curator.learning.analytics.course({ courseId: s.course.id })).summary.learners).toBe(1)
		expect((await s.c.learning.analytics.course({ courseId: s.course.id, groupId: 'none' })).summary.learners).toBe(0)
		expect((await s.c.learning.analytics.course({ courseId: s.course.id, groupId: group.id })).summary.learners).toBe(1)
		expect(await fails(s.t.as('student').learning.analytics.course({ courseId: s.course.id }))).toBe('NO_PERMISSION')
		const other = await withTestSchool()
		expect(await fails(other.as('teacher').learning.analytics.course({ courseId: s.course.id }))).toBe(
			'COURSE_NOT_FOUND',
		)
	})

	it('«Ученики»: сортировка по последней активности — не начинавшие в конце', async () => {
		const s = await setup()
		await enroll(s.t, s.course.id, s.t.people.student.email)
		await s.t.as('student').learn.lessons.open({ lessonId: s.lessons[0]?.id as string })
		// второй ученик — новый аккаунт, ничего не открывал
		await s.t.as('admin').learning.enrollments.enroll({ courseId: s.course.id, email: `idle-${Date.now()}@test.local` })
		const { items } = await s.c.learning.enrollments.list({
			courseId: s.course.id,
			sort: 'lastActivityAt',
			dir: 'desc',
		})
		expect(items.map((i) => i.lastActivityAt === null)).toEqual([false, true])
	})
})
