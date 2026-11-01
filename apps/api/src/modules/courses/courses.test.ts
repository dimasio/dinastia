// Модуль courses (карточка 2.1): права, адрес курса, удаление и архив, порядок разделов и уроков, каскады, изоляция.
import { lessonBlocks } from '@dinastia/db'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { auditLog } from '#/kernel/audit/schema.ts'
import { createBlock } from '#/kernel/blocks/blocks.ts'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { nextFreeSlug, slugify } from './slug.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))
const fails = (p: Promise<unknown>) => p.then(() => 'ok', code)

describe('адрес курса', () => {
	it('из названия — транслит, только латиница, цифры и дефис; занятый — с номером', () => {
		expect(slugify('Основы акварели: 2026')).toBe('osnovy-akvareli-2026')
		expect(slugify('Щука и Ёж')).toBe('schuka-i-ezh')
		expect(slugify('!!')).toBe('course')
		expect(slugify('Ab')).toBe('course-ab')
		expect(slugify('Я'.repeat(80)).length).toBeLessThanOrEqual(60)
		expect(nextFreeSlug('art', new Set(['art', 'art-2']))).toBe('art-3')
	})
})

describe('курсы', () => {
	it('права: смотрят все сотрудники, правят owner, admin, teacher', async () => {
		const t = await withTestSchool()
		await expectPermissionMatrix(t, (c) => c.courses.list({}), {
			allow: ['owner', 'admin', 'teacher', 'curator'],
			deny: ['student'],
		})
		await expectPermissionMatrix(t, (c) => c.courses.create({ title: 'Матрица' }), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
	})

	it('создание: черновик, адрес из названия, повтор — с номером; свой адрес — проверка формата и занятости', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const a = await c.courses.create({ title: 'Основы акварели' })
		expect(a).toMatchObject({ status: 'draft', slug: 'osnovy-akvareli', sections: [], defaultAccessMode: 'open' })
		expect(a.description).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
		expect((await c.courses.create({ title: 'Основы акварели' })).slug).toBe('osnovy-akvareli-2')
		expect(await fails(c.courses.create({ title: 'Другой', slug: 'osnovy-akvareli' }))).toBe('COURSE_SLUG_TAKEN')
		await expect(c.courses.create({ title: 'Другой', slug: 'Не адрес!' })).rejects.toMatchObject({ status: 400 })
		const doc = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'О курсе' }] }] }
		expect((await c.courses.create({ title: 'С описанием', description: doc })).description).toEqual(doc)
	})

	it('адрес меняется только у черновика; архив — с записью в журнал, повтор — без изменений', async () => {
		const t = await withTestSchool()
		const c = t.as('admin')
		const course = await c.courses.create({ title: 'Курс' })
		expect((await c.courses.update({ id: course.id, slug: 'new-address', title: 'Новое' })).slug).toBe('new-address')
		expect((await c.courses.archive({ id: course.id })).status).toBe('archived')
		await c.courses.archive({ id: course.id })
		expect(await fails(c.courses.update({ id: course.id, slug: 'other-address' }))).toBe('COURSE_SLUG_LOCKED')
		const journal = await withTenant(t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.entityId, course.id)),
		)
		expect(journal.map((r) => r.action)).toEqual(['courses.course.archived'])
	})

	it('удалить можно только черновик без уроков', async () => {
		const t = await withTestSchool()
		const c = t.as('owner')
		const empty = await c.courses.create({ title: 'Пустой' })
		await c.courses.sections.create({ courseId: empty.id, title: 'Раздел без уроков' })
		expect(await c.courses.remove({ id: empty.id })).toEqual({ ok: true })
		expect(await fails(c.courses.get({ id: empty.id }))).toBe('COURSE_NOT_FOUND')

		const full = await c.courses.create({ title: 'С уроком' })
		const s = await c.courses.sections.create({ courseId: full.id, title: 'Раздел' })
		await c.courses.lessons.create({ sectionId: s.id, title: 'Урок' })
		expect(await fails(c.courses.remove({ id: full.id }))).toBe('COURSE_NOT_EMPTY')
		await c.courses.archive({ id: full.id })
		expect(await fails(c.courses.remove({ id: full.id }))).toBe('COURSE_NOT_DRAFT')
	})

	it('список: поиск, фильтр по статусу, число разделов и уроков', async () => {
		const t = await withTestSchool()
		const c = t.as('owner')
		const a = await c.courses.create({ title: 'Акварель' })
		const s = await c.courses.sections.create({ courseId: a.id, title: 'Р1' })
		await c.courses.lessons.create({ sectionId: s.id, title: 'У1' })
		await c.courses.lessons.create({ sectionId: s.id, title: 'У2' })
		const b = await c.courses.create({ title: 'Гуашь' })
		await c.courses.archive({ id: b.id })
		const found = await c.courses.list({ q: 'акварел' })
		expect(found.items.map((x) => [x.title, x.sectionsCount, x.lessonsCount])).toEqual([['Акварель', 1, 2]])
		expect((await c.courses.list({ filters: { status: 'archived' } })).items.map((x) => x.title)).toEqual(['Гуашь'])
	})
})

describe('разделы и уроки', () => {
	it('порядок: создание в конец, перемещение раздела и урока (в т.ч. в другой раздел), дерево курса', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const course = await c.courses.create({ title: 'Дерево' })
		const s1 = await c.courses.sections.create({ courseId: course.id, title: 'Первый' })
		const s2 = await c.courses.sections.create({ courseId: course.id, title: 'Второй' })
		const l1 = await c.courses.lessons.create({ sectionId: s1.id, title: 'Урок 1' })
		const l2 = await c.courses.lessons.create({ sectionId: s1.id, title: 'Урок 2' })
		expect([s1.position, s2.position, l1.position, l2.position]).toEqual([0, 1000, 0, 1000])

		expect((await c.courses.sections.move({ id: s2.id, index: 0 })).map((s) => s.title)).toEqual(['Второй', 'Первый'])
		expect((await c.courses.lessons.move({ id: l2.id, sectionId: s2.id, index: 0 })).map((l) => l.title)).toEqual([
			'Урок 2',
		])
		await c.courses.lessons.rename({ id: l1.id, title: 'Введение' })

		const tree = await c.courses.get({ id: course.id })
		expect(tree.sections.map((s) => [s.title, s.lessons.map((l) => l.title)])).toEqual([
			['Второй', ['Урок 2']],
			['Первый', ['Введение']],
		])
		const other = await c.courses.create({ title: 'Чужой' })
		const os = await c.courses.sections.create({ courseId: other.id, title: 'Р' })
		expect(await fails(c.courses.lessons.move({ id: l1.id, sectionId: os.id, index: 0 }))).toBe(
			'LESSON_MOVE_OTHER_COURSE',
		)
	})

	it('удаление урока и раздела удаляет блоки уроков (каскад); куратор раздел не правит', async () => {
		const t = await withTestSchool()
		const c = t.as('owner')
		const course = await c.courses.create({ title: 'Каскад' })
		const s = await c.courses.sections.create({ courseId: course.id, title: 'Р' })
		const l1 = await c.courses.lessons.create({ sectionId: s.id, title: 'У1' })
		const l2 = await c.courses.lessons.create({ sectionId: s.id, title: 'У2' })
		const blocksOf = (lessonId: string) =>
			withTenant(t.school.id, (tx) => tx.select().from(lessonBlocks).where(eq(lessonBlocks.lessonId, lessonId)))
		for (const lessonId of [l1.id, l2.id])
			await withTenant(t.school.id, (tx) =>
				createBlock(tenantCtx(tx, t.school, { now: () => new Date(), log }), { lessonId, type: 'callout' }),
			)
		expect(await fails(t.as('curator').courses.sections.rename({ id: s.id, title: 'x' }))).toBe('NO_PERMISSION')

		await c.courses.lessons.remove({ id: l1.id })
		expect(await blocksOf(l1.id)).toEqual([])
		expect(await blocksOf(l2.id)).toHaveLength(1)
		await c.courses.sections.remove({ id: s.id })
		expect(await blocksOf(l2.id)).toEqual([])
		expect((await c.courses.get({ id: course.id })).sections).toEqual([])
	})

	it('другая школа не видит курс и не правит его разделы', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const course = await a.as('owner').courses.create({ title: 'Закрытый' })
		const s = await a.as('owner').courses.sections.create({ courseId: course.id, title: 'Р' })
		expect(await fails(b.as('owner').courses.get({ id: course.id }))).toBe('COURSE_NOT_FOUND')
		expect(await fails(b.as('owner').courses.sections.rename({ id: s.id, title: 'взлом' }))).toBe('SECTION_NOT_FOUND')
		expect((await b.as('owner').courses.list({})).total).toBe(0)
	})
})
