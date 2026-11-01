// Блоки урока через API модуля courses (карточка 2.3): палитра → черновик, правка по схеме типа, порядок, удаление,
// отметка «есть неопубликованные изменения», права и изоляция школ.
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

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))
const fails = (p: Promise<unknown>) => p.then(() => 'ok', code)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

async function lessonOf(t: TestSchool) {
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с уроком' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	return c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
}

describe('блоки урока', () => {
	it('из палитры — с данными по умолчанию, в конец или на позицию; правка — по схеме типа; урок помечен изменённым', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const lesson = await lessonOf(t)
		expect(lesson.hasUnpublishedChanges).toBe(false)

		const first = await c.courses.blocks.create({ lessonId: lesson.id, type: 'callout' })
		expect(first.data).toEqual({ tone: 'info', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
		const top = await c.courses.blocks.create({ lessonId: lesson.id, type: 'callout', index: 0 })
		expect((await c.courses.blocks.list({ lessonId: lesson.id })).map((b) => b.id)).toEqual([top.id, first.id])

		const saved = await c.courses.blocks.update({ id: first.id, data: { tone: 'warning', body: doc('Важно') } })
		expect(saved.data).toEqual({ tone: 'warning', body: doc('Важно') })
		await expect(
			c.courses.blocks.update({ id: first.id, data: { tone: 'loud', body: doc('x') } }),
		).rejects.toMatchObject({
			status: 400,
		})
		expect(await fails(c.courses.blocks.create({ lessonId: lesson.id, type: 'nope' }))).toBe('BLOCK_TYPE_UNKNOWN')

		const header = await c.courses.lessons.get({ id: lesson.id })
		expect(header).toMatchObject({ hasUnpublishedChanges: true, course: { title: 'Курс с уроком', status: 'draft' } })
	})

	it('порядок и удаление (с записью в журнал)', async () => {
		const t = await withTestSchool()
		const c = t.as('owner')
		const lesson = await lessonOf(t)
		const ids = [
			(await c.courses.blocks.create({ lessonId: lesson.id, type: 'callout' })).id,
			(await c.courses.blocks.create({ lessonId: lesson.id, type: 'callout' })).id,
			(await c.courses.blocks.create({ lessonId: lesson.id, type: 'callout' })).id,
		] as [string, string, string]
		expect((await c.courses.blocks.move({ id: ids[2], index: 0 })).map((b) => b.id)).toEqual([ids[2], ids[0], ids[1]])
		await c.courses.blocks.remove({ id: ids[0] })
		expect((await c.courses.blocks.list({ lessonId: lesson.id })).map((b) => b.id)).toEqual([ids[2], ids[1]])
		const journal = await withTenant(t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.entityId, ids[0])),
		)
		expect(journal.map((r) => r.action)).toEqual(['courses.block.removed'])
	})

	it('куратор видит блоки, но не правит; другая школа блок не находит', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const lesson = await lessonOf(a)
		const block = await a.as('teacher').courses.blocks.create({ lessonId: lesson.id, type: 'callout' })
		expect(await a.as('curator').courses.blocks.list({ lessonId: lesson.id })).toHaveLength(1)
		expect(await fails(a.as('curator').courses.blocks.create({ lessonId: lesson.id, type: 'callout' }))).toBe(
			'NO_PERMISSION',
		)
		expect(await fails(b.as('owner').courses.blocks.update({ id: block.id, data: block.data }))).toBe('BLOCK_NOT_FOUND')
		expect(await fails(b.as('owner').courses.blocks.list({ lessonId: lesson.id }))).toBe('LESSON_NOT_FOUND')
	})
})
