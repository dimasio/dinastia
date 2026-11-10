// Прогресс и доступ (карточка 4.3): пересчёт процента при публикации и удалении уроков и смене порога, пройденный курс не
// «распроходится»; настройки доступа урока и права; расписание от старта потока; пересдача отклонённой работы.
import { ORPCError } from '@orpc/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { drainJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { type Client, cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { intoCuratorGroup } from './testing.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const DAY = 24 * 60 * 60 * 1000
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Опубликованный курс из `n` уроков с текстом (правило «при открытии»); ученик школы зачислен. */
async function setup(n: number) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Прогресс' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lessons = []
	for (let i = 0; i < n; i++) lessons.push(await addLesson(c, section.id, `Урок ${i + 1}`))
	await c.courses.publish({ id: course.id })
	await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	return { t, c, course, section, lessons, student: t.as('student') }
}

async function addLesson(c: Client, sectionId: string, title: string, publish = true) {
	const lesson = await c.courses.lessons.create({ sectionId, title })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
	await c.courses.blocks.update({ id: block.id, data: { body: doc(title) } })
	await c.courses.lessons.update({ id: lesson.id, completionRule: 'view' })
	if (publish) await c.courses.lessons.publish({ id: lesson.id })
	return lesson
}

const mine = async (s: Awaited<ReturnType<typeof setup>>) =>
	(await s.c.learning.enrollments.list({ courseId: s.course.id })).items[0]

describe('пересчёт прогресса', () => {
	it('новый урок снижает процент, пройденный курс остаётся пройденным; удаление урока — пересчёт', async () => {
		const s = await setup(2)
		for (const l of s.lessons) await s.student.learn.lessons.open({ lessonId: l.id })
		expect(await mine(s)).toMatchObject({ progressPct: 100, status: 'completed' })
		const third = await addLesson(s.c, s.section.id, 'Урок 3')
		await drainJobs()
		expect(await mine(s)).toMatchObject({ progressPct: 67, status: 'completed' })
		await s.c.courses.lessons.remove({ id: third.id })
		await drainJobs()
		expect(await mine(s)).toMatchObject({ progressPct: 100 })
	})

	it('смена порога: ученик с 50% проходит курс при пороге 50', async () => {
		const s = await setup(2)
		await s.student.learn.lessons.open({ lessonId: s.lessons[0]?.id as string })
		expect(await mine(s)).toMatchObject({ progressPct: 50, status: 'active' })
		await s.c.courses.update({ id: s.course.id, completionThresholdPct: 50 })
		await drainJobs()
		expect(await mine(s)).toMatchObject({ progressPct: 50, status: 'completed' })
	})
})

describe('доступ к урокам', () => {
	it('настройки урока: по расписанию нужны дни или дата; другой режим сбрасывает расписание; куратор — нет', async () => {
		const s = await setup(2)
		const id = s.lessons[1]?.id as string
		expect(await fails(s.c.courses.lessons.update({ id, accessMode: 'drip' }))).toMatchObject({ code: 'DRIP_REQUIRED' })
		expect(await s.c.courses.lessons.update({ id, accessMode: 'drip', dripDays: 3 })).toMatchObject({
			accessMode: 'drip',
			dripDays: 3,
			dripDate: null,
		})
		const locked = (await s.student.learn.courses.get({ courseId: s.course.id })).sections[0]?.lessons[1]
		expect(locked).toMatchObject({ status: 'locked', lockedBy: { kind: 'date' } })
		// дата важнее дней
		expect(await s.c.courses.lessons.update({ id, dripDate: '2020-01-01' })).toMatchObject({
			dripDays: null,
			dripDate: '2020-01-01',
		})
		expect(await s.c.courses.lessons.update({ id, accessMode: 'open' })).toMatchObject({
			accessMode: 'open',
			dripDays: null,
			dripDate: null,
		})
		expect(await fails(s.t.as('curator').courses.lessons.update({ id, accessMode: 'sequential' }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
	})

	it('«через N дней» — от старта потока ученика', async () => {
		const s = await setup(2)
		const id = s.lessons[1]?.id as string
		await s.c.courses.lessons.update({ id, accessMode: 'drip', dripDays: 3 })
		const status = async () => (await s.student.learn.courses.get({ courseId: s.course.id })).sections[0]?.lessons[1]
		expect(await status()).toMatchObject({ status: 'locked' })
		const group = await s.c.learning.groups.create({
			courseId: s.course.id,
			title: 'Стартовал неделю назад',
			startsAt: new Date(Date.now() - 7 * DAY),
		})
		const e = await mine(s)
		await s.c.learning.enrollments.move({ id: e?.id as string, groupId: group.id })
		expect(await status()).toMatchObject({ status: 'available' })
	})
})

describe('пересдача отклонённой работы', () => {
	it('«Разрешить пересдачу»: из «отклонена» → «нужна доработка», с комментарием; после принятия урок пройден', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const course = await c.courses.create({ title: 'Задание' })
		const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок с заданием' })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
		await c.courses.blocks.update({ id: block.id, data: { ...block.data, prompt: doc('Сделайте') } })
		await c.courses.lessons.publish({ id: lesson.id })
		await c.courses.publish({ id: course.id })
		await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
		await intoCuratorGroup(t, course.id)
		const blockKey = (await c.courses.blocks.list({ lessonId: lesson.id }))[0]?.blockKey as string
		const student = t.as('student')
		const ref = { lessonId: lesson.id, blockKey }
		const submit = async () =>
			(await student.assignment.submit({ ...ref, body: doc('Работа'), fileIds: [] })).submission?.id as string
		const id = await submit()
		const cur = t.as('curator')
		expect(
			await fails(cur.assignment.review({ submissionId: id, decision: 'allow_resubmit', comment: doc('Рано') })),
		).toMatchObject({ code: 'SUBMISSION_STATE' })
		await cur.assignment.review({ submissionId: id, decision: 'reject', comment: doc('Не то') })
		expect(
			await fails(cur.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Так нельзя') })),
		).toMatchObject({ code: 'SUBMISSION_STATE' })
		expect(
			await fails(cur.assignment.review({ submissionId: id, decision: 'allow_resubmit', comment: null })),
		).toMatchObject({ code: 'COMMENT_REQUIRED' })
		expect(
			await cur.assignment.review({ submissionId: id, decision: 'allow_resubmit', comment: doc('Исправьте вывод') }),
		).toMatchObject({ status: 'needs_revision' })
		await submit()
		await cur.assignment.review({ submissionId: id, decision: 'accept', comment: null })
		const outline = await student.learn.courses.get({ courseId: course.id })
		expect(outline.sections[0]?.lessons[0]?.status).toBe('completed')
		expect(outline.course.progressPct).toBe(100)
	})
})
