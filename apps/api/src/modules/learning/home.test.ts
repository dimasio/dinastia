// Кабинет ученика (карточка 4.5): «Продолжить» по последнему открытому курсу, ближайшие сроки (горизонт, порядок, закрытые и
// пройденные — нет), закрытый курс без уроков в сводке, новые поля «Моих курсов», изоляция школ.
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { type Client, cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Опубликованный курс из `n` уроков (правило «при открытии», доступ «сразу»); ученик зачислен. */
async function course(t: TestSchool, title: string, n: number) {
	const c = t.as('teacher')
	const created = await c.courses.create({ title })
	const section = await c.courses.sections.create({ courseId: created.id, title: 'Раздел' })
	const lessons: { id: string }[] = []
	for (let i = 0; i < n; i++) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: `${title}: урок ${i + 1}` })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc('Текст') } })
		await c.courses.lessons.update({ id: lesson.id, completionRule: 'view' })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.update({ id: created.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: created.id })
	const enrolled = await c.learning.enrollments.enroll({ courseId: created.id, email: t.people.student.email })
	return { id: created.id, lessons, enrollmentId: enrolled.enrollment?.id as string }
}

const at = (xs: { id: string }[], i: number) => xs[i]?.id as string

describe('кабинет ученика', () => {
	it('пусто: без курсов — ни «Продолжить», ни сроков', async () => {
		const t = await withTestSchool()
		expect(await t.as('student').learn.home.get()).toEqual({ continue: null, deadlines: [] })
	})

	it('«Продолжить» — курс с последним открытым уроком, ведёт на следующий непройденный', async () => {
		const t = await withTestSchool()
		const student: Client = t.as('student')
		const a = await course(t, 'Курс А', 3)
		const b = await course(t, 'Курс Б', 2)
		// ничего не открыто — последнее зачисление
		expect((await student.learn.home.get()).continue).toMatchObject({ courseId: b.id, lessonId: at(b.lessons, 0) })
		await student.learn.lessons.open({ lessonId: at(a.lessons, 0) })
		expect((await student.learn.home.get()).continue).toMatchObject({
			courseId: a.id,
			courseTitle: 'Курс А',
			lessonId: at(a.lessons, 1),
			lessonTitle: 'Курс А: урок 2',
			progressPct: 33,
		})
		// курс пройден целиком — «Продолжить» ведёт в другой
		for (const l of a.lessons) await student.learn.lessons.open({ lessonId: l.id })
		expect((await student.learn.home.get()).continue).toMatchObject({ courseId: b.id })
	})

	it('сроки: просроченные и ближайшие 14 дней по порядку; пройденные, закрытые расписанием и дальние — нет', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const student = t.as('student')
		const k = await course(t, 'Сроки', 6)
		const [overdue, soon, far, done, locked, none] = k.lessons.map((l) => l.id)
		await c.courses.lessons.update({ id: overdue as string, deadlineDate: '2020-01-10' })
		await c.courses.lessons.update({ id: soon as string, deadlineDays: 3 })
		await c.courses.lessons.update({ id: far as string, deadlineDays: 30 })
		await c.courses.lessons.update({ id: done as string, deadlineDays: 2 })
		await c.courses.lessons.update({ id: locked as string, accessMode: 'drip', dripDays: 5 })
		await c.courses.lessons.update({ id: locked as string, deadlineDays: 7 })
		await student.learn.lessons.open({ lessonId: done as string })
		expect(none).toBeTruthy()
		const { deadlines } = await student.learn.home.get()
		expect(deadlines.map((d) => [d.lessonId, d.overdue])).toEqual([
			[overdue, true],
			[soon, false],
		])
		expect(deadlines[0]).toMatchObject({ courseId: k.id, courseTitle: 'Сроки', lessonTitle: 'Сроки: урок 1' })
	})

	it('отозванный курс: в сводке нет, в «Моих курсах» — без «Продолжить»; новые поля карточки', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const student = t.as('student')
		const k = await course(t, 'Отзыв', 2)
		await c.courses.lessons.update({ id: at(k.lessons, 1), deadlineDays: 1 })
		await student.learn.lessons.open({ lessonId: at(k.lessons, 0) })
		const [card] = await student.learn.courses.list()
		expect(card).toMatchObject({
			nextLessonId: at(k.lessons, 1),
			lessonsTotal: 2,
			lessonsCompleted: 1,
			completedAt: null,
			expiresAt: null,
		})
		expect((await student.learn.courses.get({ courseId: k.id })).course).toMatchObject({ lessonsCompleted: 1 })
		await c.learning.enrollments.revoke({ id: k.enrollmentId })
		expect(await student.learn.home.get()).toEqual({ continue: null, deadlines: [] })
		expect((await student.learn.courses.list())[0]).toMatchObject({
			revoked: true,
			nextLessonId: null,
			lessonsTotal: 2,
		})
	})

	it('пройденный курс — с датой завершения; другая школа своих данных не видит', async () => {
		const t = await withTestSchool()
		const student = t.as('student')
		const k = await course(t, 'Пройти', 1)
		await student.learn.lessons.open({ lessonId: at(k.lessons, 0) })
		const [card] = await student.learn.courses.list()
		expect(card?.completedAt).not.toBeNull()
		expect(card).toMatchObject({ nextLessonId: null, progressPct: 100 })
		const other = await withTestSchool()
		expect(await other.as('student').learn.home.get()).toEqual({ continue: null, deadlines: [] })
		expect(await other.as('student').learn.courses.list()).toEqual([])
	})
})
