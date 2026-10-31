// Журнал действий (D-021): смена роли пишется с актором и запросом, откат — без записи, журнал не правится и не
// виден другой школе.
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { auditFor } from './audit.ts'
import { auditLog } from './schema.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const rowsOf = (schoolId: string) => withTenant(schoolId, (tx) => tx.select().from(auditLog))

describe('журнал действий', () => {
	it('смена роли и блокировка сотрудника — в журнале, с актором, requestId и без ПДн', async () => {
		const t = await withTestSchool()
		const staff = (await t.as('owner').members.list({})).items
		const teacher = staff.find((m) => m.role === 'teacher')
		const owner = staff.find((m) => m.role === 'owner')
		if (!teacher || !owner) throw new Error('нет участников')

		await t.as('owner').members.changeRole({ id: teacher.id, role: 'curator' })
		await t.as('owner').members.setStatus({ id: teacher.id, status: 'blocked' })

		const rows = await rowsOf(t.school.id)
		expect(rows.map((r) => [r.action, r.entity, r.entityId, r.actorMemberId, r.diff])).toEqual([
			['schools.member.role-changed', 'member', teacher.id, owner.id, { role: { from: 'teacher', to: 'curator' } }],
			['schools.member.status-changed', 'member', teacher.id, owner.id, { status: { from: 'active', to: 'blocked' } }],
		])
		expect(rows[0]?.requestId).toMatch(/^[\w-]{8,}$/)
		expect(JSON.stringify(rows)).not.toContain(teacher.email)
	})

	it('приглашение сотрудника — в журнале без email', async () => {
		const t = await withTestSchool()
		const { id: invitationId } = await t
			.as('owner')
			.invitations.create({ email: 'new-staff@example.com', role: 'teacher' })
		const [row] = (await rowsOf(t.school.id)).filter((r) => r.action === 'schools.invitation.sent')
		expect(row).toMatchObject({ entity: 'invitation', entityId: invitationId, diff: { role: 'teacher' } })
		expect(JSON.stringify(row)).not.toContain('new-staff@example.com')
	})

	it('откат транзакции — записи нет; актор «система» — null', async () => {
		const t = await withTestSchool()
		const entityId = t.school.id
		await expect(
			withTenant(t.school.id, async (tx) => {
				await auditFor(tx, { memberId: null })('probe.audit.rolled-back', { entity: 'probe', id: entityId })
				throw new Error('откат')
			}),
		).rejects.toThrow('откат')
		await withTenant(t.school.id, (tx) =>
			auditFor(tx, { memberId: null })('probe.audit.system', { entity: 'probe', id: entityId }),
		)
		expect((await rowsOf(t.school.id)).map((r) => [r.action, r.actorMemberId])).toEqual([['probe.audit.system', null]])
	})

	it('действие не по формату — ошибка', async () => {
		const t = await withTestSchool()
		await expect(
			withTenant(t.school.id, (tx) =>
				auditFor(tx, { memberId: null })('role changed', { entity: 'x', id: t.school.id }),
			),
		).rejects.toThrow('<модуль>.<сущность>.<действие>')
	})

	it('журнал не редактируется и не удаляется ролью приложения; чужая школа его не видит', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		await withTenant(a.school.id, (tx) =>
			auditFor(tx, { memberId: null })('probe.audit.immutable', { entity: 'probe', id: a.school.id }),
		)
		await expect(
			withTenant(a.school.id, (tx) => tx.update(auditLog).set({ action: 'probe.audit.forged' })),
		).rejects.toMatchObject({ cause: { code: '42501' } })
		await expect(
			withTenant(a.school.id, (tx) => tx.delete(auditLog).where(eq(auditLog.action, 'probe.audit.immutable'))),
		).rejects.toMatchObject({ cause: { code: '42501' } })
		expect(await rowsOf(a.school.id)).toHaveLength(1)
		expect(await rowsOf(b.school.id)).toHaveLength(0)
	})
})
