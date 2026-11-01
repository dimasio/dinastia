// Публикация урока и курса через API (карточка 2.5): статусы урока, незаполненные блоки, пустой урок, публикация
// курса и «Опубликовать изменения» (все или ни одного), журнал, права, изоляция школ.
import { lessonStatus } from '@dinastia/contracts/courses'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { auditLog } from '#/kernel/audit/schema.ts'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) =>
	p.then(
		() => 'ok',
		(e) => failure(e),
	)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

async function courseOf(t: TestSchool) {
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = (title: string) => c.courses.lessons.create({ sectionId: section.id, title })
	return { c, course, lesson }
}

describe('публикация урока', () => {
	it('черновик → опубликован → правка → есть изменения → опубликован; пустой урок и незаполненный блок — нельзя', async () => {
		const t = await withTestSchool()
		const { c, lesson } = await courseOf(t)
		const l = await lesson('Урок')
		expect(lessonStatus(l)).toBe('draft')
		expect(await fails(c.courses.lessons.publish({ id: l.id }))).toMatchObject({ code: 'LESSON_EMPTY' })

		const video = await c.courses.blocks.create({ lessonId: l.id, type: 'video' })
		const err = await fails(c.courses.lessons.publish({ id: l.id }))
		expect(err).toMatchObject({
			code: 'LESSON_HAS_ISSUES',
			blocks: [{ id: video.id, type: 'video', issues: ['noUrl'] }],
		})
		expect(lessonStatus(await c.courses.lessons.get({ id: l.id }))).toBe('draft')

		await c.courses.blocks.update({ id: video.id, data: { url: 'https://rutube.ru/video/abc123/', caption: null } })
		const published = await c.courses.lessons.publish({ id: l.id })
		expect(lessonStatus(published)).toBe('published')
		expect(published.publishedAt).not.toBeNull()

		await c.courses.blocks.create({ lessonId: l.id, type: 'divider' })
		expect(lessonStatus(await c.courses.lessons.get({ id: l.id }))).toBe('changed')
		expect(lessonStatus(await c.courses.lessons.publish({ id: l.id }))).toBe('published')
		// без изменений — как есть
		const again = await c.courses.lessons.publish({ id: l.id })
		expect(again.publishedAt).toEqual((await c.courses.lessons.get({ id: l.id })).publishedAt)
	})

	it('куратор не публикует; другая школа урок не находит', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const { lesson } = await courseOf(a)
		const l = await lesson('Урок')
		expect(await fails(a.as('curator').courses.lessons.publish({ id: l.id }))).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(b.as('teacher').courses.lessons.publish({ id: l.id }))).toMatchObject({
			code: 'LESSON_NOT_FOUND',
		})
	})
})

describe('публикация курса', () => {
	it('без опубликованных уроков — нельзя; с уроком — опубликован, в журнале; повтор — без изменений', async () => {
		const t = await withTestSchool()
		const { c, course, lesson } = await courseOf(t)
		const l = await lesson('Урок')
		expect(await fails(c.courses.publish({ id: course.id }))).toMatchObject({ code: 'COURSE_NO_PUBLISHED_LESSONS' })
		await c.courses.blocks.create({ lessonId: l.id, type: 'divider' })
		await c.courses.lessons.publish({ id: l.id })
		expect((await c.courses.publish({ id: course.id })).status).toBe('published')
		expect((await c.courses.publish({ id: course.id })).status).toBe('published')
		const journal = await withTenant(t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.entityId, course.id)),
		)
		expect(journal.map((r) => r.action)).toEqual(['courses.course.published'])

		await c.courses.archive({ id: course.id })
		expect(await fails(c.courses.publish({ id: course.id }))).toMatchObject({ code: 'COURSE_ARCHIVED' })
		// в архивном курсе уроки публиковать можно — зачисленные продолжают учиться
		await c.courses.blocks.create({ lessonId: l.id, type: 'divider' })
		expect(lessonStatus(await c.courses.lessons.publish({ id: l.id }))).toBe('published')
	})

	it('«Опубликовать изменения»: все уроки с изменениями сразу; замечание в одном — не публикуется ни один', async () => {
		const t = await withTestSchool()
		const { c, course, lesson } = await courseOf(t)
		const [one, two, untouched] = [await lesson('Один'), await lesson('Два'), await lesson('Готовый')]
		await c.courses.blocks.create({ lessonId: untouched.id, type: 'divider' })
		await c.courses.lessons.publish({ id: untouched.id })
		const text = await c.courses.blocks.create({ lessonId: one.id, type: 'text' })
		await c.courses.blocks.create({ lessonId: two.id, type: 'divider' })

		expect(await fails(c.courses.publishChanges({ id: course.id }))).toMatchObject({
			code: 'COURSE_LESSONS_HAVE_ISSUES',
			lessons: [{ id: one.id, title: 'Один', blocks: 1 }],
		})
		expect(lessonStatus(await c.courses.lessons.get({ id: two.id }))).toBe('draft')

		await c.courses.blocks.update({ id: text.id, data: { body: doc('Текст') } })
		const result = await c.courses.publishChanges({ id: course.id })
		const statuses = result.sections.flatMap((s) => s.lessons.map((l) => [l.title, lessonStatus(l)]))
		expect(statuses).toEqual([
			['Один', 'published'],
			['Два', 'published'],
			['Готовый', 'published'],
		])
		expect(await fails(t.as('curator').courses.publishChanges({ id: course.id }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
	})
})
