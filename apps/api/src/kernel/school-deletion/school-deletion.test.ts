// Удаление школы (карточка 5.5): запрос владельцем с подтверждением адресом, школа закрыта сразу, письмо владельцу, отмена с
// корневого домена; через 30 дней — файлы в S3, строки школы и пользователи без других школ удалены, соседняя школа цела.
import { schools } from '@dinastia/db'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '#/kernel/auth/schema.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { getObject } from '#/kernel/storage/s3.ts'
import { files } from '#/kernel/storage/schema.ts'
import { drainJobs, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { type Client, cleanupTestSchools, clientFor, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { DELETION_GRACE_DAYS, purgeDeletedSchools } from './school-deletion.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const DAY = 24 * 60 * 60 * 1000

async function upload(c: Client) {
	const body = new TextEncoder().encode('аватар')
	const u = await c.files.createUpload({
		purpose: 'schools.avatar',
		name: 'a.png',
		mime: 'image/png',
		size: body.length,
	})
	expect((await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body })).ok).toBe(true)
	return (await c.files.complete({ id: u.fileId })).id
}

describe('удаление школы', () => {
	it('запрос: только владелец, подтверждение адресом; школа закрыта сразу; письмо владельцу', async () => {
		const t = await withTestSchool('Школа на удаление')
		await expectPermissionMatrix(t, (c) => c.schools.requestDeletion({ slug: 'не-тот' }), {
			allow: ['owner'],
			deny: ['admin', 'teacher', 'curator', 'student'],
		})
		expect(await fails(t.as('owner').schools.requestDeletion({ slug: 'не-тот' }))).toBe('SLUG_MISMATCH')
		const { deleteAt } = await t.as('owner').schools.requestDeletion({ slug: t.school.slug.toUpperCase() })
		expect(deleteAt.getTime() - Date.now()).toBeGreaterThan((DELETION_GRACE_DAYS - 1) * DAY)

		expect(await fails(t.as('guest').schools.current())).toBe('SCHOOL_DELETING')
		expect(await fails(t.as('student').schools.me())).toBe('SCHOOL_DELETING')
		expect(await fails(t.as('owner').schools.me())).toBe('SCHOOL_DELETING')

		const mail = await lastMailTo(t.people.owner.email)
		expect(mail.subject).toMatch(/^Учебный центр «Школа на удаление» будет удалён \d+ \S+ \d{4}/)
		expect(mail.fromName).toBe('Dinastia')

		// корневой домен: владелец видит школу с датой удаления, сотрудник — нет
		const ownerRoot = clientFor(t.people.owner.cookie)
		expect((await ownerRoot.schools.mine()).find((s) => s.id === t.school.id)).toMatchObject({
			deleteAt: expect.any(Date),
			role: 'owner',
		})
		expect((await clientFor(t.people.admin.cookie).schools.mine()).find((s) => s.id === t.school.id)).toBeUndefined()

		// отмена: чужой — не найдено, владелец — школа снова работает
		expect(await fails(clientFor(t.people.admin.cookie).schools.cancelDeletion({ id: t.school.id }))).toBe(
			'SCHOOL_NOT_FOUND',
		)
		expect(await ownerRoot.schools.cancelDeletion({ id: t.school.id })).toMatchObject({ deleteAt: null })
		expect(await t.as('guest').schools.current()).toMatchObject({ id: t.school.id })
		expect(await fails(ownerRoot.schools.cancelDeletion({ id: t.school.id }))).toBe('SCHOOL_NOT_DELETING')
	})

	it('через 30 дней: файлы, строки и пользователи без других школ удалены; владелец и соседняя школа целы', async () => {
		const t = await withTestSchool('Удаляемая')
		const neighbor = await withTestSchool('Соседняя')
		// ученик удаляемой школы учится и в соседней
		await withTenant(neighbor.school.id, (tx) =>
			tx.insert(members).values({ userId: t.people.curator.id, role: 'student' }),
		)
		const fileId = await upload(t.as('student'))
		const neighborFile = await upload(neighbor.as('student'))
		const keyOf = (schoolId: string, id: string) =>
			withTenant(schoolId, async (tx) => (await tx.select().from(files).where(eq(files.id, id)))[0]?.key as string)
		const key = await keyOf(t.school.id, fileId)
		const neighborKey = await keyOf(neighbor.school.id, neighborFile)

		await t.as('owner').schools.requestDeletion({ slug: t.school.slug })
		await drainJobs()
		// рано: 29 дней — ничего не удаляется
		await db
			.update(schools)
			.set({ deletionRequestedAt: new Date(Date.now() - 29 * DAY) })
			.where(eq(schools.id, t.school.id))
		await purgeDeletedSchools(new Date(), log)
		expect(await db.select().from(schools).where(eq(schools.id, t.school.id))).toHaveLength(1)

		await db
			.update(schools)
			.set({ deletionRequestedAt: new Date(Date.now() - 31 * DAY) })
			.where(eq(schools.id, t.school.id))
		expect(await purgeDeletedSchools(new Date(), log)).toBeGreaterThanOrEqual(1)

		expect(await db.select().from(schools).where(eq(schools.id, t.school.id))).toEqual([])
		expect(await getObject(key)).toBeNull()
		const left = await withTenant(t.school.id, (tx) => tx.select().from(members))
		expect(left).toEqual([])
		const alive = async (id: string) => (await db.select().from(users).where(eq(users.id, id))).length === 1
		expect(await alive(t.people.owner.id)).toBe(true) // владелец — оператор Dinastia
		expect(await alive(t.people.student.id)).toBe(false)
		expect(await alive(t.people.teacher.id)).toBe(false)
		expect(await alive(t.people.curator.id)).toBe(true) // учится в соседней

		// соседняя школа цела
		expect(await getObject(neighborKey)).not.toBeNull()
		expect(await neighbor.as('student').schools.me()).toMatchObject({ school: { id: neighbor.school.id } })
		expect(await clientFor(t.people.curator.cookie, neighbor.school.slug).schools.me()).toMatchObject({
			member: { role: 'student' },
		})
	})
})
