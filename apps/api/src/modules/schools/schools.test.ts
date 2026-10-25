import { schools } from '@dinastia/db'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { consents } from '#/kernel/auth/schema.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { AppError } from '#/kernel/errors.ts'
import { log } from '#/kernel/log.ts'
import { hasPermission } from '#/kernel/permissions.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { permissionMap } from '#/permissions.ts'
import { inviteToken, lastMailTo, pendingJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { createUser, uniqueSlug } from '#/test/users.ts'
import { acceptInvitation, getInvitation, inviteStaff } from './invitations.service.ts'
import { createSchool, findActiveMember, listMySchools } from './service.ts'

const created: string[] = []
beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	if (created.length) await db.delete(schools).where(inArray(schools.id, created))
	await pool.end()
})

async function newSchool(ownerName = 'Владелец') {
	const owner = await createUser('owner', ownerName)
	const { school, member } = await createSchool(
		{ name: 'Школа', slug: uniqueSlug() },
		{ userId: owner.id, ip: '127.0.0.1' },
	)
	created.push(school.id)
	return { school, owner, ownerMember: member }
}

async function code(p: Promise<unknown>) {
	try {
		await p
	} catch (e) {
		if (e instanceof AppError) return e.code
		throw e
	}
	throw new Error('ожидалась AppError')
}

/** Контекст школы для сервиса (до 0.5 собирается вручную). */
function inSchool<T>(
	s: { school: { id: string; slug: string; name: string } },
	who: { user: { id: string; email: string; name: string }; member: { id: string; role: SchoolCtx['member']['role'] } },
	fn: (ctx: SchoolCtx) => Promise<T>,
	now = () => new Date(),
) {
	return withTenant(
		s.school.id,
		(tx) =>
			fn({
				...tenantCtx(tx, s.school, { now, log }),
				user: who.user,
				member: who.member,
				can: (p) => hasPermission(permissionMap, who.member.role, p),
			}),
		{
			userId: who.user.id,
		},
	)
}

describe('регистрация школы', () => {
	it('создаёт школу, владельца и согласия', async () => {
		const { school, owner, ownerMember } = await newSchool()
		expect(ownerMember.role).toBe('owner')
		const c = await db.select().from(consents).where(eq(consents.schoolId, school.id))
		expect(c.map((x) => x.kind).sort()).toEqual(['offer', 'privacy'])
		expect((await listMySchools(owner.id)).map((s) => s.id)).toEqual([school.id])
	})

	it('занятый slug — SLUG_TAKEN, зарезервированный и кривой — ошибка схемы', async () => {
		const { school } = await newSchool()
		const u = await createUser()
		expect(await code(createSchool({ name: 'Школа X', slug: school.slug }, { userId: u.id }))).toBe('SLUG_TAKEN')
		await expect(createSchool({ name: 'Школа X', slug: 'admin' }, { userId: u.id })).rejects.toThrow(/SLUG_RESERVED/)
		await expect(createSchool({ name: 'Школа X', slug: '-bad-' }, { userId: u.id })).rejects.toThrow(/SLUG_FORMAT/)
	})
})

describe('членство и изоляция', () => {
	it('членство в школе B не даёт доступа к школе A (политики не складываются)', async () => {
		const a = await newSchool()
		const b = await newSchool()
		// владелец B заходит в школу A
		const memberInA = await withTenant(a.school.id, (tx) => findActiveMember(tx, b.owner.id), { userId: b.owner.id })
		expect(memberInA).toBeNull()
		const visible = await withTenant(a.school.id, (tx) => tx.query.members.findMany(), { userId: b.owner.id })
		expect(visible.every((m) => m.schoolId === a.school.id)).toBe(true)
	})

	it('вне школы пользователь видит только свои членства', async () => {
		const a = await newSchool()
		const b = await newSchool()
		const mine = await listMySchools(a.owner.id)
		expect(mine.map((s) => s.id)).toEqual([a.school.id])
		expect(mine.map((s) => s.id)).not.toContain(b.school.id)
	})
})

describe('приглашения сотрудников', () => {
	it('владелец приглашает, письмо уходит, приглашённый принимает и становится участником', async () => {
		const s = await newSchool('Анна')
		const teacher = await createUser('teacher')
		const owner = { user: s.owner, member: { id: s.ownerMember.id, role: 'owner' as const } }

		await inSchool(s, owner, (ctx) => inviteStaff(ctx, { email: teacher.email, role: 'teacher' }))
		const mail = await lastMailTo(teacher.email)
		expect(mail.subject).toBe('Приглашение в школу «Школа»')
		expect(mail.fromName).toBe('Школа')
		expect(mail.text).toContain('Анна приглашает вас в школу «Школа». Ваша роль — Преподаватель.')
		expect(mail.text).toContain(`http://${s.school.slug}.`)
		const token = await inviteToken(teacher.email)

		expect(await withTenant(s.school.id, (tx) => getInvitation(tx, token))).toMatchObject({ role: 'teacher' })
		const accepted = await withTenant(s.school.id, (tx) => acceptInvitation(tx, token, teacher), { userId: teacher.id })
		expect(accepted.role).toBe('teacher')
		expect(await code(withTenant(s.school.id, (tx) => getInvitation(tx, token)))).toBe('INVITATION_NOT_FOUND')
		expect((await listMySchools(teacher.id)).map((x) => x.id)).toEqual([s.school.id])
	})

	it('повторное приглашение продлевает, а не дублирует; старый токен перестаёт работать', async () => {
		const s = await newSchool()
		const owner = { user: s.owner, member: { id: s.ownerMember.id, role: 'owner' as const } }
		const email = `again-${Date.now()}@test.local`
		const first = await inSchool(s, owner, (ctx) => inviteStaff(ctx, { email, role: 'curator' }))
		const oldToken = await inviteToken(email)
		const second = await inSchool(s, owner, (ctx) => inviteStaff(ctx, { email, role: 'teacher' }))
		expect(second.invitationId).toBe(first.invitationId)
		const newToken = await inviteToken(email)
		expect(newToken).not.toBe(oldToken)
		expect(await code(withTenant(s.school.id, (tx) => getInvitation(tx, oldToken)))).toBe('INVITATION_NOT_FOUND')
		expect(await withTenant(s.school.id, (tx) => getInvitation(tx, newToken))).toMatchObject({ role: 'teacher' })
	})

	it('админ не может пригласить админа; учитель не может приглашать', async () => {
		const s = await newSchool()
		const admin = { user: s.owner, member: { id: s.ownerMember.id, role: 'admin' as const } }
		const teacher = { user: s.owner, member: { id: s.ownerMember.id, role: 'teacher' as const } }
		expect(await code(inSchool(s, admin, (ctx) => inviteStaff(ctx, { email: 'x@test.local', role: 'admin' })))).toBe(
			'ONLY_OWNER_INVITES_ADMIN',
		)
		expect(
			await code(inSchool(s, teacher, (ctx) => inviteStaff(ctx, { email: 'x@test.local', role: 'curator' }))),
		).toBe('NO_PERMISSION')
	})

	it('чужой email, истёкшее приглашение, токен другой школы', async () => {
		const s = await newSchool()
		const other = await newSchool()
		const owner = { user: s.owner, member: { id: s.ownerMember.id, role: 'owner' as const } }
		const invitee = await createUser('invitee')
		const stranger = await createUser('stranger')
		await inSchool(s, owner, (ctx) => inviteStaff(ctx, { email: invitee.email, role: 'curator' }))
		const token = await inviteToken(invitee.email)

		expect(await code(withTenant(s.school.id, (tx) => acceptInvitation(tx, token, stranger)))).toBe(
			'INVITATION_EMAIL_MISMATCH',
		)
		expect(await code(withTenant(other.school.id, (tx) => getInvitation(tx, token)))).toBe('INVITATION_NOT_FOUND')
		const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
		expect(await code(withTenant(s.school.id, (tx) => acceptInvitation(tx, token, invitee, later)))).toBe(
			'INVITATION_EXPIRED',
		)
	})

	it('письмо уходит только после коммита; до выпуска токена приглашение не принять', async () => {
		const s = await newSchool()
		const owner = { user: s.owner, member: { id: s.ownerMember.id, role: 'owner' as const } }
		const email = `rollback-${Date.now()}@test.local`
		await expect(
			inSchool(s, owner, async (ctx) => {
				await inviteStaff(ctx, { email, role: 'teacher' })
				throw new Error('откат')
			}),
		).rejects.toThrow('откат')
		await expect(lastMailTo(email)).rejects.toThrow(/нет письма/)
		expect(await pendingJobs()).toBe(0)
	})

	it('уже участник — ALREADY_MEMBER', async () => {
		const s = await newSchool()
		const owner = { user: s.owner, member: { id: s.ownerMember.id, role: 'owner' as const } }
		expect(await code(inSchool(s, owner, (ctx) => inviteStaff(ctx, { email: s.owner.email, role: 'teacher' })))).toBe(
			'ALREADY_MEMBER',
		)
	})
})
