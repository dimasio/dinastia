// Дедлайны (карточка 4.4): срок в настройках урока и права, «Сдать до …» и просрочка в оглавлении и плеере (урок не закрыт),
// напоминания «завтра срок» и «срок прошёл» — кому уходят, один раз, изоляция школ.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { drainJobs, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { sendDeadlineReminders } from './deadlines.service.ts'
import { deadlineReminders } from './schema.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Опубликованный курс из `n` уроков (правило «при открытии», доступ «сразу»); ученик зачислен. */
async function setup(n: number) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Сроки' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lessons = []
	for (let i = 0; i < n; i++) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: `Урок ${i + 1}` })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc('Текст') } })
		await c.courses.lessons.update({ id: lesson.id, completionRule: 'view' })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.update({ id: course.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: course.id })
	const enrolled = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	return { t, c, course, lessons, student: t.as('student'), enrollmentId: enrolled.enrollment?.id as string }
}

const remind = (t: TestSchool, now: Date) =>
	withTenant(t.school.id, (tx) => sendDeadlineReminders(tenantCtx(tx, t.school, { now: () => now, log })))

describe('срок сдачи урока', () => {
	it('настройки: дни или дата (одно заменяет другое), сброс; куратор — нет', async () => {
		const s = await setup(1)
		const id = s.lessons[0]?.id as string
		expect(await s.c.courses.lessons.update({ id, deadlineDays: 7 })).toMatchObject({
			deadlineDays: 7,
			deadlineDate: null,
		})
		expect(await s.c.courses.lessons.update({ id, deadlineDate: '2030-01-15' })).toMatchObject({
			deadlineDays: null,
			deadlineDate: '2030-01-15',
		})
		expect(await s.c.courses.lessons.update({ id, deadlineDays: null, deadlineDate: null })).toMatchObject({
			deadlineDays: null,
			deadlineDate: null,
		})
		expect(await fails(s.t.as('curator').courses.lessons.update({ id, deadlineDays: 1 }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
	})

	it('ученик видит срок; просроченный урок открыт, после завершения пометка снимается', async () => {
		const s = await setup(2)
		const [l1, l2] = s.lessons as unknown as [{ id: string }, { id: string }]
		await s.c.courses.lessons.update({ id: l1.id, deadlineDate: '2020-01-10' })
		await s.c.courses.lessons.update({ id: l2.id, deadlineDays: 5 })
		const outline = async () => (await s.student.learn.courses.get({ courseId: s.course.id })).sections[0]?.lessons
		const [a, b] = (await outline()) ?? []
		expect(a).toMatchObject({ overdue: true, status: 'available' })
		expect(new Date(a?.dueAt as unknown as string).toISOString()).toBe('2020-01-10T20:59:59.999Z')
		expect(b).toMatchObject({ overdue: false })
		expect(b?.dueAt).not.toBeNull()
		const lesson = await s.student.learn.lessons.get({ lessonId: l1.id })
		expect(lesson.lesson).toMatchObject({ overdue: true })
		await s.student.learn.lessons.open({ lessonId: l1.id })
		expect((await outline())?.[0]).toMatchObject({ status: 'completed', overdue: false })
	})
})

describe('напоминания', () => {
	// 10 марта 2030, 12:00 по Москве
	const now = new Date('2030-03-10T09:00:00Z')

	it('«завтра срок» и «срок прошёл» — по одному разу; старые просрочки и пройденные уроки — без писем', async () => {
		const s = await setup(4)
		const [soon, overdue, old, done] = s.lessons as { id: string }[]
		await s.c.courses.lessons.update({ id: soon?.id as string, deadlineDate: '2030-03-10' }) // сегодня до 23:59
		await s.c.courses.lessons.update({ id: overdue?.id as string, deadlineDate: '2030-03-09' }) // вчера
		await s.c.courses.lessons.update({ id: old?.id as string, deadlineDate: '2030-03-01' }) // давно
		await s.c.courses.lessons.update({ id: done?.id as string, deadlineDate: '2030-03-10' })
		await s.student.learn.lessons.open({ lessonId: done?.id as string })

		expect(await remind(s.t, now)).toBe(2)
		await drainJobs()
		expect((await lastMailTo(s.t.people.student.email)).subject).toMatch(/срок/)
		const rows = await withTenant(s.t.school.id, (tx) =>
			tx.select().from(deadlineReminders).where(eq(deadlineReminders.enrollmentId, s.enrollmentId)),
		)
		expect(rows.map((r) => [r.lessonId, r.kind]).sort()).toEqual(
			[
				[soon?.id, 'soon'],
				[overdue?.id, 'overdue'],
			].sort(),
		)
		// повторный запуск — ничего нового
		expect(await remind(s.t, now)).toBe(0)
	})

	it('отозванный доступ и курс без сроков — без писем; другие школы не затрагиваются', async () => {
		const s = await setup(1)
		await s.c.courses.lessons.update({ id: s.lessons[0]?.id as string, deadlineDate: '2030-03-10' })
		const other = await setup(1)
		await other.c.courses.lessons.update({ id: other.lessons[0]?.id as string, deadlineDate: '2030-03-10' })
		await s.c.learning.enrollments.revoke({ id: s.enrollmentId })
		expect(await remind(s.t, now)).toBe(0)
		expect(await remind(other.t, now)).toBe(1)
	})
})
