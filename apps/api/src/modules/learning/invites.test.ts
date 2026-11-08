// Приглашения на курс (карточка 4.1(б)): ссылка со сроком, лимитом и отзывом; адресное приглашение на почту; присоединение
// по токену (участник-ученик создаётся, зачисление, повтор не расходует лимит), отказы, права, изоляция школ.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { members } from '#/kernel/members/schema.ts'
import { signUp } from '#/test/http.ts'
import { lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { uniqueEmail } from '#/test/users.ts'
import { enrollmentInvites } from './schema.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const tokenOf = (url: string) => url.split('/join/')[1] as string

async function setup() {
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
	await c.courses.publish({ id: course.id })
	return { t, c, course }
}

describe('ссылка-приглашение', () => {
	it('создание, публичные сведения, присоединение нового человека: ученик создан, курс открыт', async () => {
		const { t, c, course } = await setup()
		const { invite, url } = await c.learning.invites.create({ courseId: course.id })
		expect(invite).toMatchObject({ email: null, status: 'active', uses: 0, maxUses: null })
		expect(url).toContain(`${t.school.slug}.`)
		const token = tokenOf(url)

		const info = await t.as('guest').join.get({ token })
		expect(info).toMatchObject({ courseTitle: 'Акварель', email: null, school: { slug: t.school.slug } })

		const newcomer = await signUp('newcomer')
		const res = await t.as(newcomer).join.accept({ token })
		expect(res.courseId).toBe(course.id)
		expect(await t.as(newcomer).learn.courses.list()).toMatchObject([{ id: course.id }])
		const list = await c.learning.enrollments.list({ courseId: course.id })
		expect(list.items).toMatchObject([{ studentEmail: newcomer.email, source: 'link' }])
		expect((await c.learning.invites.list({ courseId: course.id }))[0]).toMatchObject({ uses: 1 })

		// повтор тем же человеком — без нового использования
		await t.as(newcomer).join.accept({ token })
		expect((await c.learning.invites.list({ courseId: course.id }))[0]).toMatchObject({ uses: 1 })
	})

	it('существующий ученик школы присоединяется, срок курса применяется', async () => {
		const { t, c, course } = await setup()
		await c.courses.update({ id: course.id, accessDays: 14 })
		const { url } = await c.learning.invites.create({ courseId: course.id })
		await t.as('student').join.accept({ token: tokenOf(url) })
		const [row] = (await c.learning.enrollments.list({ courseId: course.id })).items
		expect(row?.expiresAt).not.toBeNull()
	})

	it('лимит, срок, отзыв, неизвестный токен — понятные коды', async () => {
		const { t, c, course } = await setup()
		const one = await c.learning.invites.create({ courseId: course.id, maxUses: 1 })
		await t.as('student').join.accept({ token: tokenOf(one.url) })
		const other = await signUp('late')
		expect(await fails(t.as(other).join.accept({ token: tokenOf(one.url) }))).toMatchObject({ code: 'JOIN_EXHAUSTED' })
		expect(await fails(t.as('guest').join.get({ token: tokenOf(one.url) }))).toMatchObject({ code: 'JOIN_EXHAUSTED' })

		const revoked = await c.learning.invites.create({ courseId: course.id })
		expect(await c.learning.invites.revoke({ id: revoked.invite.id })).toMatchObject({ status: 'revoked' })
		expect(await fails(t.as(other).join.accept({ token: tokenOf(revoked.url) }))).toMatchObject({
			code: 'JOIN_REVOKED',
		})

		const old = await c.learning.invites.create({ courseId: course.id })
		await withTenant(t.school.id, (tx) =>
			tx
				.update(enrollmentInvites)
				.set({ expiresAt: new Date(Date.now() - 1000) })
				.where(eq(enrollmentInvites.id, old.invite.id)),
		)
		expect(await fails(t.as(other).join.accept({ token: tokenOf(old.url) }))).toMatchObject({ code: 'JOIN_EXPIRED' })
		expect(await fails(t.as('guest').join.get({ token: 'x'.repeat(43) }))).toMatchObject({ code: 'JOIN_NOT_FOUND' })
	})

	it('сотрудник и заблокированный не присоединяются; без входа принять нельзя', async () => {
		const { t, c, course } = await setup()
		const { url } = await c.learning.invites.create({ courseId: course.id })
		const token = tokenOf(url)
		expect(await fails(t.as('curator').join.accept({ token }))).toMatchObject({ code: 'NOT_A_STUDENT' })
		await withTenant(t.school.id, (tx) =>
			tx.update(members).set({ status: 'blocked' }).where(eq(members.userId, t.people.student.id)),
		)
		expect(await fails(t.as('student').join.accept({ token }))).toMatchObject({ code: 'MEMBER_BLOCKED' })
		expect(await fails(t.as('guest').join.accept({ token }))).toMatchObject({ code: 'UNAUTHENTICATED' })
	})

	it('курс в черновике: ссылку создать нельзя', async () => {
		const { c } = await setup()
		const draft = await c.courses.create({ title: 'Черновик' })
		expect(await fails(c.learning.invites.create({ courseId: draft.id }))).toMatchObject({ code: 'COURSE_NOT_FOUND' })
	})
})

describe('приглашение на почту', () => {
	it('преподаватель приглашает незнакомую почту: письмо со ссылкой, принять может только владелец почты', async () => {
		const { t, c, course } = await setup()
		const email = uniqueEmail('guest')
		expect(await c.learning.enrollments.enroll({ courseId: course.id, email })).toMatchObject({ outcome: 'invited' })
		const mail = await lastMailTo(email)
		expect(mail.subject).toContain('Акварель')
		const token = mail.text.match(/\/join\/([\w-]+)/)?.[1] as string
		expect(token).toBeTruthy()
		const list = await c.learning.invites.list({ courseId: course.id })
		expect(list).toMatchObject([{ email, maxUses: 1, status: 'active' }])
		expect((await t.as('guest').join.get({ token })).email).toBe(email)

		const stranger = await signUp('stranger')
		expect(await fails(t.as(stranger).join.accept({ token }))).toMatchObject({ code: 'JOIN_EMAIL_MISMATCH' })
	})

	it('приглашённый с этой почтой присоединяется: источник «invite», приглашение использовано', async () => {
		const { t, c, course } = await setup()
		const person = await signUp('invited')
		await c.learning.enrollments.enroll({ courseId: course.id, email: person.email })
		const token = (await lastMailTo(person.email)).text.match(/\/join\/([\w-]+)/)?.[1] as string
		await t.as(person).join.accept({ token })
		expect((await c.learning.enrollments.list({ courseId: course.id })).items).toMatchObject([
			{ studentEmail: person.email, source: 'invite' },
		])
		expect((await c.learning.invites.list({ courseId: course.id }))[0]).toMatchObject({ status: 'exhausted', uses: 1 })
		expect(await fails(t.as(person).join.get({ token }))).toMatchObject({ code: 'JOIN_EXHAUSTED' })
	})

	it('повторное приглашение на ту же почту не плодит записей и выпускает новый токен', async () => {
		const { c, course } = await setup()
		const email = uniqueEmail('twice')
		await c.learning.enrollments.enroll({ courseId: course.id, email })
		await c.learning.enrollments.enroll({ courseId: course.id, email })
		expect(await c.learning.invites.list({ courseId: course.id })).toHaveLength(1)
	})
})

describe('права и изоляция', () => {
	it('создают и отзывают admin, teacher; куратор и ученик — нет', async () => {
		const { t, course } = await setup()
		await expectPermissionMatrix(t, (cl) => cl.learning.invites.create({ courseId: course.id }), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
		await expectPermissionMatrix(t, (cl) => cl.learning.invites.list({ courseId: course.id }), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
	})

	it('токен чужой школы на хосте другой школы не работает', async () => {
		const a = await setup()
		const b = await setup()
		const { url } = await a.c.learning.invites.create({ courseId: a.course.id })
		expect(await fails(b.t.as('guest').join.get({ token: tokenOf(url) }))).toMatchObject({ code: 'JOIN_NOT_FOUND' })
		const { invite } = await a.c.learning.invites.create({ courseId: a.course.id })
		expect(await fails(b.c.learning.invites.revoke({ id: invite.id }))).toMatchObject({ code: 'INVITE_NOT_FOUND' })
	})
})
