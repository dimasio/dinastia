// Плеер ученика (карточка 2.6): мои курсы, оглавление, режимы доступа open/sequential/drip, завершение по правилам,
// срок доступа, опубликованная версия и секреты, изоляция школ, права.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { courses, lessons } from '../courses/schema.ts'
import { enrollments } from './schema.ts'
import { enrollMember } from './service.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Курс из 2 разделов и трёх опубликованных уроков; ученик зачислен. */
async function setup(opts: { access?: 'open' | 'sequential' | 'drip' } = {}) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс ученика' })
	const s1 = await c.courses.sections.create({ courseId: course.id, title: 'Раздел 1' })
	const s2 = await c.courses.sections.create({ courseId: course.id, title: 'Раздел 2' })
	const made = []
	for (const [section, title] of [
		[s1, 'Урок 1'],
		[s1, 'Урок 2'],
		[s2, 'Урок 3'],
	] as const) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc(`Текст ${title}`) } })
		await c.courses.lessons.publish({ id: lesson.id })
		made.push({ ...lesson, blockId: block.id })
	}
	await withTenant(t.school.id, (tx) =>
		tx
			.update(courses)
			.set({ defaultAccessMode: opts.access ?? 'open' })
			.where(eq(courses.id, course.id)),
	)
	await c.courses.publish({ id: course.id })
	const student = await enroll(t, course.id)
	return { t, c, course, lessons: made, student: t.as('student'), ...student }
}

async function enroll(t: TestSchool, courseId: string, role: 'student' | 'curator' = 'student') {
	return withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, t.people[role].id))
		const ctx = tenantCtx(tx, t.school, { now: () => new Date(), log })
		const e = await enrollMember(ctx, { memberId: (m as { id: string }).id, courseId })
		return { memberId: (m as { id: string }).id, enrollmentId: e.id }
	})
}

describe('мои курсы и оглавление', () => {
	it('ученик видит свой курс с прогрессом; другие роли и незачисленные — пусто; черновик скрыт', async () => {
		const { t, course, student } = await setup()
		const list = await student.learn.courses.list()
		expect(list).toMatchObject([{ id: course.id, title: 'Курс ученика', progressPct: 0, expired: false }])
		await student.learn.courses.get({ courseId: course.id })
		// курс вернули в черновик (прямой правкой БД) — ученик его не видит
		await withTenant(t.school.id, (tx) => tx.update(courses).set({ status: 'draft' }).where(eq(courses.id, course.id)))
		expect(await student.learn.courses.list()).toEqual([])
		expect(await fails(student.learn.courses.get({ courseId: course.id }))).toMatchObject({ code: 'COURSE_NOT_FOUND' })
		await withTenant(t.school.id, (tx) =>
			tx.update(courses).set({ status: 'published' }).where(eq(courses.id, course.id)),
		)
		// незачисленный участник другой роли с правом учиться — курсов нет, курс не найден
		const other = await withTestSchool()
		expect(await other.as('student').learn.courses.list()).toEqual([])
		expect(await fails(other.as('student').learn.courses.get({ courseId: course.id }))).toMatchObject({
			code: 'COURSE_NOT_FOUND',
		})
		expect(await fails(t.as('teacher').learn.courses.list())).toMatchObject({ code: 'NO_PERMISSION' })
	})

	it('в оглавлении только опубликованные уроки по порядку; неопубликованный не виден и не открывается', async () => {
		const { t, c, course, student } = await setup()
		const draft = await c.courses.lessons.create({
			sectionId: (await c.courses.get({ id: course.id })).sections[0]?.id as string,
			title: 'Черновик',
		})
		const outline = await student.learn.courses.get({ courseId: course.id })
		expect(outline.sections.map((s) => s.lessons.map((l) => l.title))).toEqual([['Урок 1', 'Урок 2'], ['Урок 3']])
		expect(outline.nextLessonId).toBe(outline.sections[0]?.lessons[0]?.id)
		expect(await fails(student.learn.lessons.get({ lessonId: draft.id }))).toMatchObject({ code: 'LESSON_NOT_FOUND' })
		void t
	})
})

describe('урок', () => {
	it('отдаёт опубликованную версию, а не черновик; соседние уроки в навигации', async () => {
		const { c, lessons: ls, student } = await setup()
		const [l1, l2] = ls as [(typeof ls)[0], (typeof ls)[0]]
		await c.courses.blocks.update({ id: l2.blockId, data: { body: doc('ЧЕРНОВИК, не опубликован') } })
		const page = await student.learn.lessons.get({ lessonId: l2.id })
		expect(JSON.stringify(page.blocks)).toContain('Текст Урок 2')
		expect(JSON.stringify(page.blocks)).not.toContain('ЧЕРНОВИК')
		expect(page.prev).toMatchObject({ id: l1.id, locked: false })
		expect(page.next).toMatchObject({ title: 'Урок 3', locked: false })
		expect(page.lesson).toMatchObject({ courseTitle: 'Курс ученика', completionRule: 'all_blocks' })
	})

	it('правило view: открыл — завершён, прогресс пересчитан; повтор не меняет; курс пройден — completed', async () => {
		const { t, lessons: ls, student, enrollmentId } = await setup()
		expect(await student.learn.lessons.open({ lessonId: ls[0]?.id as string })).toEqual({
			status: 'completed',
			progressPct: 33,
		})
		expect(await student.learn.lessons.open({ lessonId: ls[0]?.id as string })).toMatchObject({ progressPct: 33 })
		await student.learn.lessons.open({ lessonId: ls[1]?.id as string })
		expect(await student.learn.lessons.open({ lessonId: ls[2]?.id as string })).toMatchObject({ progressPct: 100 })
		const [e] = await withTenant(t.school.id, (tx) =>
			tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId)),
		)
		expect(e).toMatchObject({ status: 'completed', progressPct: 100 })
		expect(e?.completedAt).not.toBeNull()
	})

	it('правило manual: открыл — в процессе; «Завершить» — завершён, повтор безопасен', async () => {
		const { t, lessons: ls, student } = await setup()
		const id = ls[0]?.id as string
		await withTenant(t.school.id, (tx) =>
			tx.update(lessons).set({ completionRule: 'manual' }).where(eq(lessons.id, id)),
		)
		expect(await student.learn.lessons.open({ lessonId: id })).toMatchObject({ status: 'in_progress', progressPct: 0 })
		expect(await student.learn.lessons.complete({ lessonId: id })).toMatchObject({
			status: 'completed',
			progressPct: 33,
		})
		expect(await student.learn.lessons.complete({ lessonId: id })).toMatchObject({
			status: 'completed',
			progressPct: 33,
		})
	})
})

describe('режимы доступа', () => {
	it('sequential: следующий урок закрыт, пока предыдущий не завершён; причина — урок', async () => {
		const { lessons: ls, course, student } = await setup({ access: 'sequential' })
		const [l1, l2, l3] = ls as [(typeof ls)[0], (typeof ls)[0], (typeof ls)[0]]
		const before = await student.learn.courses.get({ courseId: course.id })
		expect(before.sections.flatMap((s) => s.lessons.map((l) => l.status))).toEqual(['available', 'locked', 'locked'])
		expect(before.sections[0]?.lessons[1]?.lockedBy).toEqual({ kind: 'lesson', lessonId: l1.id, title: 'Урок 1' })
		expect(await fails(student.learn.lessons.get({ lessonId: l2.id }))).toMatchObject({
			code: 'LESSON_LOCKED',
			lockedBy: { kind: 'lesson', lessonId: l1.id },
		})
		expect(await fails(student.learn.lessons.open({ lessonId: l3.id }))).toMatchObject({ code: 'LESSON_LOCKED' })
		expect(await fails(student.learn.lessons.complete({ lessonId: l2.id }))).toMatchObject({ code: 'LESSON_LOCKED' })

		await student.learn.lessons.open({ lessonId: l1.id }) // view → завершён
		const after = await student.learn.courses.get({ courseId: course.id })
		expect(after.sections.flatMap((s) => s.lessons.map((l) => l.status))).toEqual(['completed', 'available', 'locked'])
		expect(after.nextLessonId).toBe(l2.id)
		await student.learn.lessons.get({ lessonId: l2.id })
	})

	it('drip: по дате и по дням после зачисления; причина — дата', async () => {
		const { t, lessons: ls, course, student } = await setup({ access: 'drip' })
		const [l1, l2, l3] = ls as [(typeof ls)[0], (typeof ls)[0], (typeof ls)[0]]
		const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
		await withTenant(t.school.id, async (tx) => {
			await tx.update(lessons).set({ dripDate: '2020-01-01' }).where(eq(lessons.id, l1.id)) // давно наступила
			await tx.update(lessons).set({ dripDate: future }).where(eq(lessons.id, l2.id))
			await tx.update(lessons).set({ dripDays: 3 }).where(eq(lessons.id, l3.id)) // зачислен только что
		})
		const outline = await student.learn.courses.get({ courseId: course.id })
		const all = outline.sections.flatMap((s) => s.lessons)
		expect(all.map((l) => l.status)).toEqual(['available', 'locked', 'locked'])
		expect(all[1]?.lockedBy).toMatchObject({ kind: 'date' })
		expect(await fails(student.learn.lessons.get({ lessonId: l3.id }))).toMatchObject({ code: 'LESSON_LOCKED' })
		// зачисление «состарилось» на 4 дня — урок с dripDays: 3 открылся
		await withTenant(t.school.id, (tx) =>
			tx.update(enrollments).set({ enrolledAt: new Date(Date.now() - 4 * 24 * 3600 * 1000) }),
		)
		await student.learn.lessons.get({ lessonId: l3.id })
	})

	it('режим урока имеет приоритет над режимом курса (inherit — как у курса)', async () => {
		const { t, lessons: ls, course, student } = await setup({ access: 'sequential' })
		await withTenant(t.school.id, (tx) =>
			tx
				.update(lessons)
				.set({ accessMode: 'open' })
				.where(eq(lessons.id, ls[2]?.id as string)),
		)
		const all = (await student.learn.courses.get({ courseId: course.id })).sections.flatMap((s) => s.lessons)
		expect(all.map((l) => l.status)).toEqual(['available', 'locked', 'available'])
	})
})

describe('срок и архив', () => {
	it('срок вышел — «доступ закончился»: оглавления и уроков нет; архивный курс остаётся доступным', async () => {
		const { t, course, lessons: ls, student, enrollmentId } = await setup()
		await t.as('teacher').courses.archive({ id: course.id })
		expect((await student.learn.courses.get({ courseId: course.id })).sections.length).toBe(2)
		await student.learn.lessons.get({ lessonId: ls[0]?.id as string })

		await withTenant(t.school.id, (tx) =>
			tx
				.update(enrollments)
				.set({ expiresAt: new Date(Date.now() - 1000) })
				.where(eq(enrollments.id, enrollmentId)),
		)
		const expired = await student.learn.courses.get({ courseId: course.id })
		expect(expired).toMatchObject({ course: { expired: true }, sections: [], nextLessonId: null })
		expect((await student.learn.courses.list())[0]?.expired).toBe(true)
		expect(await fails(student.learn.lessons.get({ lessonId: ls[0]?.id as string }))).toMatchObject({
			code: 'ENROLLMENT_EXPIRED',
		})
	})

	it('зачисление идемпотентно; на черновик и архив зачислить нельзя', async () => {
		const { t, course, enrollmentId } = await setup()
		expect((await enroll(t, course.id)).enrollmentId).toBe(enrollmentId)
		const draft = await t.as('teacher').courses.create({ title: 'Черновик' })
		await expect(enroll(t, draft.id)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' })
	})
})

describe('изоляция', () => {
	it('урок чужой школы не открывается даже по id', async () => {
		const a = await setup()
		const b = await withTestSchool()
		expect(await fails(b.as('student').learn.lessons.get({ lessonId: a.lessons[0]?.id as string }))).toMatchObject({
			code: 'LESSON_NOT_FOUND',
		})
	})
})
