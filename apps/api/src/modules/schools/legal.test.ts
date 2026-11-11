// Юридическое школы (5.5): реквизиты оператора ПДн в настройках, экран настроек из реестра, согласие на обработку ПДн
// школой при присоединении ученика и принятии приглашения сотрудником.
import { ORPCError } from '@orpc/client'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { consents } from '#/kernel/auth/schema.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { signUp } from '#/test/http.ts'
import { inviteToken, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? { status: e.status, ...(e.data as object) } : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)

const pdConsents = (userId: string, schoolId: string) =>
	db
		.select()
		.from(consents)
		.where(and(eq(consents.userId, userId), eq(consents.schoolId, schoolId), eq(consents.kind, 'pd_processing')))

async function publishedCourse(t: Awaited<ReturnType<typeof withTestSchool>>, title: string) {
	const c = t.as('teacher')
	const course = await c.courses.create({ title })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
	await c.courses.blocks.update({
		id: block.id,
		data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] } },
	})
	await c.courses.lessons.publish({ id: lesson.id })
	await c.courses.publish({ id: course.id })
	const { url } = await c.learning.invites.create({ courseId: course.id })
	return url.split('/join/')[1] as string
}

describe('настройки школы: реквизиты оператора ПДн', () => {
	it('экран настроек — owner и admin; поля приходят с видом контрола', async () => {
		const t = await withTestSchool()
		await expectPermissionMatrix(t, (c) => c.settings.list(), {
			allow: ['owner', 'admin'],
			deny: ['teacher', 'curator', 'student'],
		})
		const fields = await t.as('admin').settings.list()
		expect(fields.filter((f) => f.module === 'schools')).toEqual([
			expect.objectContaining({ name: 'pdOperator', group: 'legal', kind: 'text', value: '', editable: true }),
			expect.objectContaining({ name: 'pdContact', kind: 'email', optional: true, value: '' }),
			expect.objectContaining({ name: 'privacyUrl', kind: 'url', optional: true, value: '' }),
		])
	})

	it('изменение проверяется по схеме; пусто — школа и шаблон Dinastia', async () => {
		const t = await withTestSchool('Школа рисования')
		expect(await t.as('guest').schools.legal()).toEqual({
			operator: 'Школа рисования',
			contact: null,
			privacyUrl: null,
		})

		expect(
			await fails(t.as('admin').settings.update({ module: 'schools', patch: { pdContact: 'не почта' } })),
		).toMatchObject({ status: 400 })
		expect(
			await fails(t.as('admin').settings.update({ module: 'schools', patch: { privacyUrl: 'http://school.ru/p' } })),
		).toMatchObject({ status: 400 })
		expect(await fails(t.as('admin').settings.update({ module: 'nope', patch: {} }))).toMatchObject({
			code: 'SETTING_UNKNOWN',
		})

		await t.as('admin').settings.update({
			module: 'schools',
			patch: {
				pdOperator: 'ИП Иванова А. А., ИНН 000000000000',
				pdContact: 'pd@school.test',
				privacyUrl: 'https://school.test/p',
			},
		})
		expect(await t.as('guest').schools.legal()).toEqual({
			operator: 'ИП Иванова А. А., ИНН 000000000000',
			contact: 'pd@school.test',
			privacyUrl: 'https://school.test/p',
		})
	})
})

describe('согласие на обработку ПДн школой', () => {
	it('ученик: без согласия не присоединиться; согласие пишется один раз на версию текста', async () => {
		const t = await withTestSchool()
		const first = await publishedCourse(t, 'Первый')
		const second = await publishedCourse(t, 'Второй')
		expect((await t.as('guest').join.get({ token: first })).legal).toMatchObject({ privacyUrl: null })

		const person = await signUp('learner')
		expect(await fails(t.as(person).join.accept({ token: first } as never))).toMatchObject({ status: 400 })
		expect(await fails(t.as(person).join.accept({ token: first, consent: false } as never))).toMatchObject({
			status: 400,
		})
		expect(await pdConsents(person.id, t.school.id)).toEqual([])

		await t.as(person).join.accept({ token: first, consent: true })
		const [given] = await pdConsents(person.id, t.school.id)
		expect(given).toMatchObject({ version: expect.stringMatching(/^draft-2026-11@/) })
		expect(given?.ip).not.toBeUndefined()

		// второй курс той же школы, текст не менялся — повторной записи нет
		await t.as(person).join.accept({ token: second, consent: true })
		expect(await pdConsents(person.id, t.school.id)).toHaveLength(1)

		// школа сменила политику — следующее присоединение фиксирует новую версию
		await t.as('admin').settings.update({ module: 'schools', patch: { privacyUrl: 'https://school.test/p' } })
		const third = await publishedCourse(t, 'Третий')
		await t.as(person).join.accept({ token: third, consent: true })
		const all = await pdConsents(person.id, t.school.id)
		expect(all.map((c) => c.version.split('@')[0]).sort()).toEqual(['draft-2026-11', 'url'])
	})

	it('сотрудник по приглашению: согласие обязательно и пишется', async () => {
		const t = await withTestSchool()
		const person = await signUp('staff')
		await t.as('admin').invitations.create({ email: person.email, role: 'teacher' })
		const token = await inviteToken(person.email)
		expect((await t.as('guest').invitations.get({ token })).legal.operator).toBe(t.school.name)
		expect(await fails(t.as(person).invitations.accept({ token } as never))).toMatchObject({ status: 400 })
		await t.as(person).invitations.accept({ token, consent: true })
		expect(await pdConsents(person.id, t.school.id)).toHaveLength(1)
	})
})
