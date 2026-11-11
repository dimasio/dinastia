// Письма «открылись новые уроки» (карточка 4.8): одно письмо на курс по урокам расписания, повтор — без писем, старые и открытые
// при зачислении — без писем, отозванный доступ — без писем.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { memoryOutbox } from '#/kernel/mail/transport.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { drainJobs, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { sendLessonOpenedNotices } from './lesson-notices.service.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const DAY = 24 * 60 * 60 * 1000
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Курс из `n` опубликованных уроков (доступ «сразу»); ученик зачислен сейчас. */
async function setup(n: number) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Расписание' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lessons = []
	for (let i = 0; i < n; i++) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: `Урок ${i + 1}` })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc('Текст') } })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.update({ id: course.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: course.id })
	const enrolled = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	await drainJobs()
	return { t, c, lessons: lessons.map((l) => l.id), enrollmentId: enrolled.enrollment?.id as string }
}

const notify = (t: TestSchool, at: Date) =>
	withTenant(t.school.id, (tx) => sendLessonOpenedNotices(tenantCtx(tx, t.school, { now: () => at, log })))
const later = (days: number) => new Date(Date.now() + days * DAY)
const mailsTo = (to: string) => memoryOutbox.filter((m) => m.to === to && m.subject.includes('открылись новые уроки'))

describe('письмо «открылись новые уроки»', () => {
	it('одно письмо на курс со всеми открывшимися; повтор — без писем; ещё не открытые и давно открытые — без писем', async () => {
		const s = await setup(4)
		const [, second, third, fourth] = s.lessons
		for (const id of [second, third])
			await s.c.courses.lessons.update({ id: id as string, accessMode: 'drip', dripDays: 2 })
		await s.c.courses.lessons.update({ id: fourth as string, accessMode: 'drip', dripDays: 10 })

		expect(await notify(s.t, later(1))).toBe(0)
		expect(await notify(s.t, later(2.5))).toBe(1)
		const mail = await lastMailTo(s.t.people.student.email)
		expect(mail.subject).toContain('открылись новые уроки курса «Расписание»')
		expect(mail.text).toContain('Урок 2')
		expect(mail.text).toContain('Урок 3')
		expect(mail.text).not.toContain('Урок 4')
		expect(await notify(s.t, later(2.6))).toBe(0)
		// четвёртый открылся 10 дней назад — поздно писать
		expect(await notify(s.t, later(20))).toBe(0)
		await drainJobs()
		expect(mailsTo(s.t.people.student.email)).toHaveLength(1)
	})

	it('открытый при зачислении (дата в прошлом) и отозванный доступ — без писем', async () => {
		const s = await setup(2)
		await s.c.courses.lessons.update({ id: s.lessons[0] as string, accessMode: 'drip', dripDate: '2020-01-01' })
		await s.c.courses.lessons.update({ id: s.lessons[1] as string, accessMode: 'drip', dripDays: 1 })
		await s.c.learning.enrollments.revoke({ id: s.enrollmentId })
		expect(await notify(s.t, later(1.5))).toBe(0)
		await s.c.learning.enrollments.restore({ id: s.enrollmentId })
		expect(await notify(s.t, later(1.5))).toBe(1)
		const mail = await lastMailTo(s.t.people.student.email)
		expect(mail.text).toContain('Урок 2')
		expect(mail.text).not.toContain('Урок 1')
	})
})
