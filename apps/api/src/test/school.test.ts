// Сама фикстура и образец её использования (скилл testing).
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, expectPermissionMatrix, ROLES, withTestSchool } from './school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

describe('withTestSchool', () => {
	it('каждая роль видит себя в школе; гость — нет', async () => {
		const t = await withTestSchool()
		for (const role of ROLES) expect((await t.as(role).schools.me()).member.role).toBe(role)
		await expect(t.as('guest').schools.me()).rejects.toMatchObject({ status: 401 })
	})

	it('матрица прав: приглашать сотрудников могут owner и admin', async () => {
		const t = await withTestSchool()
		let n = 0
		await expectPermissionMatrix(
			t,
			(c) => c.invitations.create({ email: `m${++n}-${Date.now()}@test.local`, role: 'curator' }),
			{
				allow: ['owner', 'admin'],
				deny: ['teacher', 'curator', 'student'],
			},
		)
	})
})
