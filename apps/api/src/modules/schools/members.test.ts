import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))

describe('список сотрудников', () => {
	it('без учеников; поиск, фильтр, сортировка, пагинация', async () => {
		const t = await withTestSchool()
		const all = await t.as('owner').members.list({})
		expect(all.items.map((m) => m.role).sort()).toEqual(['admin', 'curator', 'owner', 'teacher'])
		expect(all.total).toBe(4)

		const byEmail = await t.as('admin').members.list({ q: t.people.curator.email.slice(0, 12).toUpperCase() })
		expect(byEmail.items.map((m) => m.id)).toHaveLength(1)
		expect((await t.as('owner').members.list({ filters: { role: 'teacher' } })).items.map((m) => m.role)).toEqual([
			'teacher',
		])

		const page1 = await t.as('owner').members.list({ pageSize: 3, sort: 'role', dir: 'asc' })
		const page2 = await t.as('owner').members.list({ pageSize: 3, page: 2, sort: 'role', dir: 'asc' })
		expect(page1.items).toHaveLength(3)
		expect(page2.items).toHaveLength(1)
		expect(page1.total).toBe(4)
		expect(new Set([...page1.items, ...page2.items].map((m) => m.id)).size).toBe(4)
	})

	it('спецсимволы поиска не становятся шаблоном; неизвестная сортировка — 400', async () => {
		const t = await withTestSchool()
		expect((await t.as('owner').members.list({ q: '%' })).total).toBe(0)
		await expect(t.as('owner').members.list({ sort: 'password' as 'name' })).rejects.toMatchObject({ status: 400 })
	})

	it('права: читают owner, admin, teacher', async () => {
		const t = await withTestSchool()
		await expectPermissionMatrix(t, (c) => c.members.list({}), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
	})
})

describe('смена роли и блокировка', () => {
	it('владелец меняет роли; правила: не себя, не владельца, администраторами управляет владелец', async () => {
		const t = await withTestSchool()
		const ids = Object.fromEntries((await t.as('owner').members.list({})).items.map((m) => [m.role, m.id])) as Record<
			'owner' | 'admin' | 'teacher' | 'curator',
			string
		>

		expect((await t.as('owner').members.changeRole({ id: ids.teacher, role: 'curator' })).role).toBe('curator')
		expect(
			code(
				await t
					.as('owner')
					.members.changeRole({ id: ids.owner, role: 'admin' })
					.catch((e) => e),
			),
		).toBe('CANNOT_CHANGE_SELF')
		expect(
			code(
				await t
					.as('admin')
					.members.changeRole({ id: ids.owner, role: 'teacher' })
					.catch((e) => e),
			),
		).toBe('OWNER_IMMUTABLE')
		expect(
			code(
				await t
					.as('admin')
					.members.changeRole({ id: ids.curator, role: 'admin' })
					.catch((e) => e),
			),
		).toBe('ONLY_OWNER_MANAGES_ADMINS')
		expect(
			code(
				await t
					.as('admin')
					.members.changeRole({ id: ids.admin, role: 'teacher' })
					.catch((e) => e),
			),
		).toBe('CANNOT_CHANGE_SELF')
	})

	it('ученика и участника другой школы как сотрудника не найти', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const studentId = (await a.as('student').schools.me()).member.id
		const foreignId = (await b.as('owner').members.list({})).items[0]?.id ?? ''
		expect(
			code(
				await a
					.as('owner')
					.members.changeRole({ id: studentId, role: 'teacher' })
					.catch((e) => e),
			),
		).toBe('MEMBER_NOT_FOUND')
		expect(
			code(
				await a
					.as('owner')
					.members.setStatus({ id: foreignId, status: 'blocked' })
					.catch((e) => e),
			),
		).toBe('MEMBER_NOT_FOUND')
	})

	it('заблокированный теряет доступ сразу; разблокировка возвращает', async () => {
		const t = await withTestSchool()
		const teacherId = (await t.as('teacher').schools.me()).member.id
		await t.as('admin').members.setStatus({ id: teacherId, status: 'blocked' })
		expect(
			code(
				await t
					.as('teacher')
					.schools.me()
					.catch((e) => e),
			),
		).toBe('NOT_A_MEMBER')
		await t.as('admin').members.setStatus({ id: teacherId, status: 'active' })
		expect((await t.as('teacher').schools.me()).member.role).toBe('teacher')
	})

	it('права на изменения: owner и admin', async () => {
		const t = await withTestSchool()
		const curatorId = (await t.as('curator').schools.me()).member.id
		await expectPermissionMatrix(t, (c) => c.members.setStatus({ id: curatorId, status: 'active' }), {
			allow: ['owner', 'admin'],
			deny: ['teacher', 'curator', 'student'],
		})
	})
})
