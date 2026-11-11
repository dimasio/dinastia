// Нет N+1 в основных списках (5.2, скилл performance): число SQL-запросов не растёт с числом строк — список из 2 и из 6 строк
// делает одинаковое число запросов.
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { countQueries } from '#/test/queries.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { uniqueEmail } from '#/test/users.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Опубликованный курс из двух уроков (доступ «сразу»), один — со сроком сдачи. */
async function course(t: TestSchool, title: string) {
	const c = t.as('teacher')
	const created = await c.courses.create({ title })
	const section = await c.courses.sections.create({ courseId: created.id, title: 'Раздел' })
	for (const name of ['Первый', 'Второй']) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: name })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc(name) } })
		await c.courses.lessons.publish({ id: lesson.id })
		if (name === 'Второй') await c.courses.lessons.update({ id: lesson.id, deadlineDays: 3 })
	}
	await c.courses.update({ id: created.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: created.id })
	return created.id
}

/** Число запросов при `few` и при `many` элементах: `grow(n)` доводит данные до n, `run` — вызов списка. */
async function queriesAt(grow: (n: number) => Promise<void>, run: () => Promise<unknown>) {
	await grow(2)
	await run() // прогрев: кэш схемы, лимиты
	const few = await countQueries(run)
	await grow(6)
	const many = await countQueries(run)
	return { few, many }
}

describe('нет N+1', () => {
	it('ученики курса, аналитика курса', async () => {
		const t = await withTestSchool()
		const courseId = await course(t, 'Ученики')
		let enrolled = 0
		const grow = async (n: number) => {
			for (; enrolled < n; enrolled++)
				await t
					.as('owner')
					.learning.enrollments.enroll({ courseId, email: uniqueEmail('n1'), name: `Ученик ${enrolled}` })
		}
		const list = await queriesAt(grow, () => t.as('teacher').learning.enrollments.list({ courseId, pageSize: 50 }))
		expect(list.many).toBe(list.few)
		const analytics = await queriesAt(grow, () => t.as('teacher').learning.analytics.course({ courseId }))
		expect(analytics.many).toBe(analytics.few)
	}, 120_000)

	it('кабинет ученика и мои курсы; курсы школы', async () => {
		const t = await withTestSchool()
		const ids: string[] = []
		const grow = async (n: number) => {
			while (ids.length < n) {
				const id = await course(t, `Курс ${ids.length}`)
				await t.as('teacher').learning.enrollments.enroll({ courseId: id, email: t.people.student.email })
				ids.push(id)
			}
		}
		const student = t.as('student')
		const home = await queriesAt(grow, () => student.learn.home.get())
		expect(home.many).toBe(home.few)
		const mine = await queriesAt(grow, () => student.learn.courses.list())
		expect(mine.many).toBe(mine.few)
		const courses = await queriesAt(grow, () => t.as('teacher').courses.list({ pageSize: 50 }))
		expect(courses.many).toBe(courses.few)
	}, 180_000)
})
