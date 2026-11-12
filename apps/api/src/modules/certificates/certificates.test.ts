// Сертификаты (карточка 4.7): выдача при прохождении курса и PDF (кириллица читается обратно), номер по порядку и без дублей
// при параллельной выдаче, выключенный шаблон и «Выдать прошедшим», аннулирование, публичная проверка (имя скрыто / с кодом —
// полностью, чужая школа — не найден), права и область куратора.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { extractText, getDocumentProxy } from 'unpdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '#/kernel/auth/schema.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { closeBrowser } from '#/kernel/documents/pdf.ts'
import { log } from '#/kernel/log.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { drainJobs, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, expectPermissionMatrix, type TestSchool, withTestSchool } from '#/test/school.ts'
import { uniqueEmail } from '#/test/users.ts'
import { enrollments } from '../learning/schema.ts'
import { intoCuratorGroup } from '../learning/testing.ts'
import { certificates } from './schema.ts'
import { certificateNumber, issueForEnrollment, maskName } from './service.ts'

beforeAll(startTestWorker)
// закрытие браузера и воркера под нагрузкой дольше 10 с по умолчанию
afterAll(async () => {
	await stopTestWorker()
	await closeBrowser()
	await cleanupTestSchools()
	await pool.end()
}, 30_000)

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const STUDENT = 'Мария Кузнецова'
const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date()))

/** Курс из двух уроков «при открытии», ученик зачислен; шаблон — включён или нет. */
async function setup(enabled = true) {
	const t = await withTestSchool('Учебный центр «Охрана труда»')
	await db.update(users).set({ name: STUDENT }).where(eq(users.id, t.people.student.id))
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Пожарная безопасность' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Основы' })
	const lessons: { id: string }[] = []
	for (const title of ['Первый', 'Второй']) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc(title) } })
		await c.courses.lessons.update({ id: lesson.id, completionRule: 'view' })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.update({ id: course.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: course.id })
	const template = await c.certificates.template.get({ courseId: course.id })
	const { courseId: _, signatureUrl: _s, backgroundUrl: _b, ...fields } = template
	await c.certificates.template.save({
		...fields,
		courseId: course.id,
		enabled,
		signerName: 'Анна Смирнова',
		signerTitle: 'Директор',
	})
	await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	return { t, c, course, lessons, fields }
}

const passCourse = async (s: Awaited<ReturnType<typeof setup>>) => {
	for (const l of s.lessons) await s.t.as('student').learn.lessons.open({ lessonId: l.id })
	await drainJobs(30_000)
}

const codeOf = (t: TestSchool, id: string) =>
	withTenant(t.school.id, async (tx) => {
		const [row] = await tx.select().from(certificates).where(eq(certificates.id, id))
		return row?.verifyCode as string
	})

describe('сертификаты', () => {
	it('прохождение курса → сертификат с номером и PDF на русском; повтор не выдаёт второй', async () => {
		const s = await setup()
		await passCourse(s)
		const [mine] = await s.t.as('student').certificates.my.list()
		expect(mine).toMatchObject({
			courseId: s.course.id,
			courseTitle: 'Пожарная безопасность',
			number: certificateNumber(s.t.school.slug, year, 1),
			status: 'ready',
		})
		const { url } = await s.t.as('student').certificates.my.download({ id: mine?.id as string })
		const pdf = new Uint8Array(await (await fetch(url)).arrayBuffer())
		expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
		const { text } = await extractText(await getDocumentProxy(pdf), { mergePages: true })
		expect(text).toContain('Удостоверение')
		expect(text).toContain(STUDENT)
		expect(text).toContain('«Пожарная безопасность»')
		expect(text).toContain('Анна Смирнова')
		expect(text).toContain(certificateNumber(s.t.school.slug, year, 1))
		// письмо «сертификат готов» (4.8): номер и ссылка на страницу курса
		const mail = await lastMailTo(s.t.people.student.email)
		expect(mail.subject).toContain('удостоверение по курсу «Пожарная безопасность» готово')
		expect(mail.text).toContain(certificateNumber(s.t.school.slug, year, 1))
		expect(mail.text).toContain(`/learn/courses/${s.course.id}`)

		// подписчик повторно (повтор задачи) — второго нет
		const enrollmentId = (await s.c.certificates.list({ courseId: s.course.id })).items[0]?.enrollmentId as string
		const again = await withTenant(s.t.school.id, (tx) =>
			issueForEnrollment(tenantCtx(tx, s.t.school, { now: () => new Date(), log }), enrollmentId),
		)
		expect(again).toBeNull()
		expect((await s.c.certificates.list({ courseId: s.course.id })).total).toBe(1)
	}, 60_000)

	it('выключенный шаблон — не выдаётся; «Выдать прошедшим» после включения; номера без дублей при параллельной выдаче', async () => {
		const s = await setup(false)
		await passCourse(s)
		expect(await s.t.as('student').certificates.my.list()).toEqual([])
		expect(await fails(s.c.certificates.issueCompleted({ courseId: s.course.id }))).toBe('CERTIFICATE_DISABLED')

		// ещё двое прошли курс (статус — напрямую): выдача параллельно
		const ids: string[] = []
		for (const n of [1, 2]) {
			const r = await s.t
				.as('owner')
				.learning.enrollments.enroll({ courseId: s.course.id, email: uniqueEmail('cert'), name: `Ученик ${n}` })
			ids.push(r.enrollment?.id as string)
		}
		await withTenant(s.t.school.id, (tx) =>
			tx
				.update(enrollments)
				.set({ status: 'completed', completedAt: new Date() })
				.where(eq(enrollments.courseId, s.course.id)),
		)
		await s.c.certificates.template.save({ ...s.fields, courseId: s.course.id, enabled: true })
		const issued = await Promise.all(
			ids.map((id) =>
				withTenant(s.t.school.id, (tx) =>
					issueForEnrollment(tenantCtx(tx, s.t.school, { now: () => new Date(), log }), id),
				),
			),
		)
		expect(issued.map((c) => c?.number).sort()).toEqual([
			certificateNumber(s.t.school.slug, year, 1),
			certificateNumber(s.t.school.slug, year, 2),
		])
		expect(await s.c.certificates.issueCompleted({ courseId: s.course.id })).toEqual({ issued: 1, requeued: 0 })
		expect(await s.c.certificates.issueCompleted({ courseId: s.course.id })).toEqual({ issued: 0, requeued: 0 })
		await drainJobs(30_000)
		const { items } = await s.c.certificates.list({ courseId: s.course.id })
		expect(items.map((i) => i.status)).toEqual(['ready', 'ready', 'ready'])
		expect(new Set(items.map((i) => i.number)).size).toBe(3)
	}, 90_000)

	it('проверка по номеру: имя скрыто, с кодом — полностью; аннулирован; чужая школа — не найден', async () => {
		const s = await setup()
		await passCourse(s)
		const [row] = (await s.c.certificates.list({ courseId: s.course.id })).items
		const number = row?.number as string
		const guest = s.t.as('guest')
		const name = STUDENT
		expect(await guest.certificates.verify({ number: number.toLowerCase() })).toMatchObject({
			number,
			status: 'valid',
			studentName: maskName(name),
			nameHidden: true,
			courseTitle: 'Пожарная безопасность',
			schoolName: 'Учебный центр «Охрана труда»',
		})
		const code = await codeOf(s.t, row?.id as string)
		expect(await guest.certificates.verify({ number, code })).toMatchObject({ studentName: name, nameHidden: false })
		expect(await guest.certificates.verify({ number, code: 'WRONG123' })).toMatchObject({ nameHidden: true })

		const other = await withTestSchool()
		expect(await fails(other.as('guest').certificates.verify({ number }))).toBe('CERTIFICATE_NOT_FOUND')

		await s.c.certificates.revoke({ id: row?.id as string })
		expect(await guest.certificates.verify({ number })).toMatchObject({ status: 'revoked' })
		expect(await s.t.as('student').certificates.my.list()).toEqual([])
		expect(await fails(s.t.as('student').certificates.my.download({ id: row?.id as string }))).toBe(
			'CERTIFICATE_NOT_FOUND',
		)
		// сотрудник аннулированный скачивает (для разбирательств)
		expect((await s.c.certificates.download({ id: row?.id as string })).url).toMatch(/^http/)
	}, 60_000)

	it('права: шаблон — администратор и преподаватель; список — и куратор (только свои потоки); свои — ученик', async () => {
		const s = await setup()
		await passCourse(s)
		await expectPermissionMatrix(s.t, (c) => c.certificates.template.get({ courseId: s.course.id }), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
		await expectPermissionMatrix(s.t, (c) => c.certificates.list({ courseId: s.course.id }), {
			allow: ['owner', 'admin', 'teacher', 'curator'],
			deny: ['student'],
		})
		await expectPermissionMatrix(s.t, (c) => c.certificates.my.list(), {
			allow: ['owner', 'student'],
			deny: ['admin', 'teacher', 'curator'],
		})
		const curator = s.t.as('curator')
		expect((await curator.certificates.list({ courseId: s.course.id })).total).toBe(0)
		const id = (await s.c.certificates.list({ courseId: s.course.id })).items[0]?.id as string
		expect(await fails(curator.certificates.download({ id }))).toBe('CERTIFICATE_NOT_FOUND')
		await intoCuratorGroup(s.t, s.course.id)
		expect((await curator.certificates.list({ courseId: s.course.id })).total).toBe(1)
		// чужая школа не видит сертификат по id
		const other = await withTestSchool()
		expect(await fails(other.as('teacher').certificates.download({ id }))).toBe('CERTIFICATE_NOT_FOUND')
	}, 60_000)

	it('предпросмотр — HTML с подстановками и встроенными шрифтами; картинка не своего назначения отклоняется', async () => {
		const s = await setup()
		const { html } = await s.c.certificates.template.preview({
			...s.fields,
			courseId: s.course.id,
			body: doc('Выдан {имя} за курс «{курс}» {дата}'),
		})
		expect(html).toContain('Выдан Иван Петров за курс «Пожарная безопасность»')
		expect(html).toContain("font-family: 'PT Serif'")
		expect(html).toContain('<svg')
		expect(
			await fails(
				s.c.certificates.template.save({
					...s.fields,
					courseId: s.course.id,
					signatureFileId: '01900000-0000-7000-8000-000000000000',
				}),
			),
		).toBe('CERTIFICATE_IMAGE_INVALID')
	})

	it('оформление школы (5.9): логотип и цвет школы в рамке и заголовке', async () => {
		const s = await setup()
		await s.t.as('owner').schools.branding.update({
			theme: { primaryColor: '#0f766e', accentColor: null, font: 'system', radius: 'medium', defaultScheme: 'system' },
		})
		const { html } = await s.c.certificates.template.preview({ ...s.fields, courseId: s.course.id })
		expect(html).toContain('#0f766e')
	})
})
