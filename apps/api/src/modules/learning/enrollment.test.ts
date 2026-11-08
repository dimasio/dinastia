// Зачисление, сроки и отзыв доступа (карточка 4.1): зачисление по почте, создание аккаунта, идемпотентность, срок,
// продление, ночная задача истечения, отзыв и возврат, права и изоляция школ.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { uniqueEmail } from '#/test/users.ts'
import { expireDueEnrollments } from './enrollment.service.ts'
import { enrollments } from './schema.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const DAY = 24 * 60 * 60 * 1000

/** Школа с опубликованным курсом (один урок). */
async function setup(accessDays?: number) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Акварель' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
	await c.courses.blocks.update({
		id: block.id,
		data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] } },
	})
	await c.courses.lessons.publish({ id: lesson.id })
	if (accessDays) await c.courses.update({ id: course.id, accessDays })
	await c.courses.publish({ id: course.id })
	return { t, c, course, lesson }
}

describe('зачисление по почте', () => {
	it('ученик школы зачисляется сразу, письмо уходит, курс виден; повтор — то же зачисление', async () => {
		const { t, course } = await setup()
		const email = t.people.student.email
		const res = await t.as('teacher').learning.enrollments.enroll({ courseId: course.id, email })
		expect(res.outcome).toBe('enrolled')
		expect(res.enrollment).toMatchObject({ status: 'active', source: 'manual', expiresAt: null, progressPct: 0 })
		expect((await lastMailTo(email)).subject).toContain('Акварель')
		expect(await t.as('student').learn.courses.list()).toMatchObject([{ id: course.id, revoked: false }])
		const again = await t.as('teacher').learning.enrollments.enroll({ courseId: course.id, email: email.toUpperCase() })
		expect(again).toMatchObject({ outcome: 'already', enrollment: { id: res.enrollment.id } })
	})

	it('незнакомая почта: аккаунт создаёт администратор, преподаватель — нет', async () => {
		const { t, course } = await setup()
		const email = uniqueEmail('new')
		expect(await fails(t.as('teacher').learning.enrollments.enroll({ courseId: course.id, email }))).toMatchObject({
			code: 'ONLY_ADMIN_CREATES_ACCOUNTS',
		})
		const res = await t.as('admin').learning.enrollments.enroll({ courseId: course.id, email, name: 'Новый Ученик' })
		expect(res.outcome).toBe('enrolled')
		expect(res.enrollment).toMatchObject({ studentName: 'Новый Ученик', studentEmail: email })
		const list = await t.as('teacher').learning.enrollments.list({ courseId: course.id })
		expect(list.total).toBe(1)
	})

	it('сотрудник, заблокированный и черновик — отказ', async () => {
		const { t, course, c } = await setup()
		expect(
			await fails(c.learning.enrollments.enroll({ courseId: course.id, email: t.people.curator.email })),
		).toMatchObject({ code: 'NOT_A_STUDENT' })
		await withTenant(t.school.id, (tx) =>
			tx.update(members).set({ status: 'blocked' }).where(eq(members.userId, t.people.student.id)),
		)
		expect(
			await fails(c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })),
		).toMatchObject({ code: 'MEMBER_BLOCKED' })
		const draft = await c.courses.create({ title: 'Черновик' })
		const other = t.people.student.email
		await withTenant(t.school.id, (tx) =>
			tx.update(members).set({ status: 'active' }).where(eq(members.userId, t.people.student.id)),
		)
		expect(await fails(c.learning.enrollments.enroll({ courseId: draft.id, email: other }))).toMatchObject({
			code: 'COURSE_NOT_FOUND', // курс без публикации
		})
	})
})

describe('сроки', () => {
	it('срок по умолчанию из курса, свой срок, продление и «без срока»', async () => {
		const { t, c, course } = await setup(30)
		const email = t.people.student.email
		const { enrollment } = await c.learning.enrollments.enroll({ courseId: course.id, email })
		const days = (iso: string | Date | null) => Math.round((new Date(iso as string).getTime() - Date.now()) / DAY)
		expect(days(enrollment.expiresAt)).toBe(30)

		const ext = await c.learning.enrollments.extend({ id: enrollment.id, accessDays: 10 })
		expect(days(ext.expiresAt)).toBe(40)
		const free = await c.learning.enrollments.unlimit({ id: enrollment.id })
		expect(free.expiresAt).toBeNull()

		const second = await setup(30)
		const own = await second.c.learning.enrollments.enroll({
			courseId: second.course.id,
			email: second.t.people.student.email,
			accessDays: 7,
		})
		expect(days(own.enrollment.expiresAt)).toBe(7)
	})

	it('просроченное показывается «истёк», ночная задача переводит в expired, продление и повторное зачисление возвращают доступ', async () => {
		const { t, c, course } = await setup()
		const { enrollment } = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
		await withTenant(t.school.id, (tx) =>
			tx
				.update(enrollments)
				.set({ expiresAt: new Date(Date.now() - DAY) })
				.where(eq(enrollments.id, enrollment.id)),
		)
		const shown = await c.learning.enrollments.list({ courseId: course.id })
		expect(shown.items[0]?.status).toBe('expired')
		expect((await c.learning.enrollments.list({ courseId: course.id, filters: { status: 'expired' } })).total).toBe(1)
		expect((await c.learning.enrollments.list({ courseId: course.id, filters: { status: 'active' } })).total).toBe(0)

		const n = await withTenant(t.school.id, (tx) =>
			expireDueEnrollments(tenantCtx(tx, t.school, { now: () => new Date(), log })),
		)
		expect(n).toBe(1)
		const [row] = await withTenant(t.school.id, (tx) => tx.select().from(enrollments))
		expect(row?.status).toBe('expired')
		expect(await t.as('student').learn.courses.list()).toMatchObject([{ expired: true }])

		const ext = await c.learning.enrollments.extend({ id: enrollment.id, accessDays: 5 })
		expect(ext.status).toBe('active')
		await withTenant(t.school.id, (tx) =>
			tx.update(enrollments).set({ status: 'expired', expiresAt: new Date(Date.now() - DAY) }),
		)
		const back = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
		expect(back).toMatchObject({ outcome: 'restored', enrollment: { id: enrollment.id, status: 'active' } })
	})
})

describe('отзыв и возврат', () => {
	it('отозванный доступ закрывает курс, прогресс сохраняется, возврат открывает', async () => {
		const { t, c, course, lesson } = await setup()
		const student = t.as('student')
		const { enrollment } = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
		await student.learn.lessons.open({ lessonId: lesson.id })
		const done = await student.learn.courses.list()
		const pct = done[0]?.progressPct

		const revoked = await c.learning.enrollments.revoke({ id: enrollment.id })
		expect(revoked.status).toBe('revoked')
		expect(await fails(c.learning.enrollments.revoke({ id: enrollment.id }))).toMatchObject({
			code: 'ENROLLMENT_STATE',
		})
		expect(await student.learn.courses.list()).toMatchObject([{ revoked: true }])
		const outline = await student.learn.courses.get({ courseId: course.id })
		expect(outline.course.revoked).toBe(true)
		expect(outline.sections).toEqual([])
		expect(await fails(student.learn.lessons.get({ lessonId: lesson.id }))).toMatchObject({
			code: 'ENROLLMENT_REVOKED',
		})
		expect(await fails(c.learning.enrollments.extend({ id: enrollment.id, accessDays: 3 }))).toMatchObject({
			code: 'ENROLLMENT_REVOKED',
		})

		const restored = await c.learning.enrollments.restore({ id: enrollment.id })
		expect(restored.status).not.toBe('revoked')
		expect(restored.progressPct).toBe(pct)
		expect(await fails(c.learning.enrollments.restore({ id: enrollment.id }))).toMatchObject({
			code: 'ENROLLMENT_STATE',
		})
		await student.learn.lessons.get({ lessonId: lesson.id })
	})

	it('повторное зачисление отозванного возвращает доступ', async () => {
		const { t, c, course } = await setup()
		const email = t.people.student.email
		const { enrollment } = await c.learning.enrollments.enroll({ courseId: course.id, email })
		await c.learning.enrollments.revoke({ id: enrollment.id })
		const res = await c.learning.enrollments.enroll({ courseId: course.id, email })
		expect(res).toMatchObject({ outcome: 'restored', enrollment: { id: enrollment.id, status: 'active' } })
	})
})

describe('список, права, изоляция', () => {
	it('поиск и сортировка по ученикам', async () => {
		const { t, c, course } = await setup()
		await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
		await t.as('admin').learning.enrollments.enroll({ courseId: course.id, email: uniqueEmail('zed'), name: 'Зиновий' })
		const all = await c.learning.enrollments.list({ courseId: course.id, sort: 'studentName', dir: 'desc' })
		expect(all.total).toBe(2)
		const found = await c.learning.enrollments.list({ courseId: course.id, q: 'зинов' })
		expect(found.items.map((i) => i.studentName)).toEqual(['Зиновий'])
	})

	it('матрица прав: читают admin, teacher, curator; зачисляют admin и teacher', async () => {
		const { t, course } = await setup()
		await expectPermissionMatrix(t, (cl) => cl.learning.enrollments.list({ courseId: course.id }), {
			allow: ['owner', 'admin', 'teacher', 'curator'],
			deny: ['student'],
		})
		await expectPermissionMatrix(
			t,
			(cl) => cl.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email }),
			{ allow: ['owner', 'admin', 'teacher'], deny: ['curator', 'student'] },
		)
	})

	it('чужая школа не видит и не меняет зачисления', async () => {
		const a = await setup()
		const b = await setup()
		const { enrollment } = await a.c.learning.enrollments.enroll({
			courseId: a.course.id,
			email: a.t.people.student.email,
		})
		expect(await fails(b.c.learning.enrollments.revoke({ id: enrollment.id }))).toMatchObject({
			code: 'ENROLLMENT_NOT_FOUND',
		})
		expect((await b.c.learning.enrollments.list({ courseId: a.course.id })).total).toBe(0)
	})
})
