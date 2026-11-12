// Выгрузки (ядро, карточка 4.6): задача пишет xlsx, ссылку видит только запросивший; право определения, неизвестная выгрузка,
// область куратора, изоляция школ, очистка истёкших. Определение — `learning.course-students`.
import { ORPCError } from '@orpc/client'
import { readSheet } from 'read-excel-file/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { intoCuratorGroup } from '#/modules/learning/testing.ts'
import { drainJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { type Client, cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { cleanupExportsJob, EXPORT_TTL_MS } from './exports.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Курс из двух уроков, ученик зачислен и прошёл первый. */
async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Охрана труда' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
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
	await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	await t.as('student').learn.lessons.open({ lessonId: lessons[0]?.id as string })
	return { t, c, course }
}

/** Запустить выгрузку и дождаться файла. */
async function run(client: Client, courseId: string) {
	const started = await client.exports.start({ key: 'learning.course-students', input: { courseId } })
	expect(started).toMatchObject({ status: 'pending', url: null })
	await drainJobs()
	return { id: started.id, state: await client.exports.get({ id: started.id }) }
}

const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer())

describe('выгрузки', () => {
	it('учеников курса: файл с заголовками и строками, ссылка — только запросившему', async () => {
		const s = await setup()
		const { id, state } = await run(s.c, s.course.id)
		expect(state).toMatchObject({ status: 'ready', rows: 1 })
		const sheet = await readSheet(await download(state.url as string))
		expect(sheet[0]).toEqual([
			'Слушатель',
			'Email',
			'Учебная группа',
			'Статус',
			'Зачислен',
			'Доступ до',
			'Прогресс',
			'Пройдено тем',
			'Всего тем',
			'Просрочено',
			'Последняя активность',
		])
		expect(sheet[1]).toMatchObject([
			expect.any(String),
			s.t.people.student.email,
			null,
			'Учится',
			expect.any(Date),
			null,
			0.5,
			1,
			2,
			0,
			expect.any(Date),
		])
		// другой сотрудник той же школы и сотрудник другой школы ссылку не получают
		expect(await fails(s.t.as('admin').exports.get({ id }))).toBe('EXPORT_NOT_FOUND')
		const other = await withTestSchool()
		expect(await fails(other.as('teacher').exports.get({ id }))).toBe('EXPORT_NOT_FOUND')
	})

	it('права: ученик — нет; неизвестная выгрузка и неверный вход — ошибки; чужой курс — не найден', async () => {
		const s = await setup()
		expect(
			await fails(
				s.t.as('student').exports.start({ key: 'learning.course-students', input: { courseId: s.course.id } }),
			),
		).toBe('NO_PERMISSION')
		expect(await fails(s.c.exports.start({ key: 'learning.nope', input: {} }))).toBe('EXPORT_UNKNOWN')
		expect(await fails(s.c.exports.start({ key: 'learning.course-students', input: { courseId: 'x' } }))).toBe(
			'EXPORT_INPUT_INVALID',
		)
		const other = await withTestSchool()
		expect(
			await fails(
				other.as('teacher').exports.start({ key: 'learning.course-students', input: { courseId: s.course.id } }),
			),
		).toBe('COURSE_NOT_FOUND')
	})

	it('куратор выгружает только свои потоки', async () => {
		const s = await setup()
		const curator = s.t.as('curator')
		expect((await run(curator, s.course.id)).state).toMatchObject({ status: 'ready', rows: 0 })
		await intoCuratorGroup(s.t, s.course.id)
		expect((await run(curator, s.course.id)).state).toMatchObject({ status: 'ready', rows: 1 })
	})

	it('истёкшая выгрузка удаляется вместе с файлом', async () => {
		const s = await setup()
		const { id } = await run(s.c, s.course.id)
		await cleanupIn(s.t, new Date(Date.now() + EXPORT_TTL_MS + 60_000))
		expect(await fails(s.c.exports.get({ id }))).toBe('EXPORT_NOT_FOUND')
	})
})

const cleanupIn = (t: TestSchool, now: Date) =>
	withTenant(t.school.id, (tx) =>
		Promise.resolve(cleanupExportsJob.handler(tenantCtx(tx, t.school, { now: () => now, log }), {})),
	)
