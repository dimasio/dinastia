// Консоль оператора (карточка 5.6а): доступ только оператору на корневом домене, второй фактор обязателен, вход по ссылке
// оператору не уходит; создание школы — приглашение владельца, владелец принимает оферту и политику; журнал консоли.
import { ORPCError } from '@orpc/client'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog } from '#/kernel/audit/schema.ts'
import { consents, users } from '#/kernel/auth/schema.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { memoryOutbox } from '#/kernel/mail/transport.ts'
import { opsAudit } from '#/kernel/ops/schema.ts'
import { findOperatorProceduresWithout2fa } from '#/kernel/router-guard.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { router } from '#/router.ts'
import { call, signUp } from '#/test/http.ts'
import { drainJobs, inviteToken, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, clientFor, withTestSchool } from '#/test/school.ts'
import { totp } from '#/test/totp.ts'
import { TEST_PASSWORD, uniqueSlug } from '#/test/users.ts'
import { findSchoolBySlug } from '../schools/service.ts'
import { refreshSchoolStats } from './stats.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) =>
	e instanceof ORPCError ? { status: e.status, code: (e.data as { code?: string })?.code } : e
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)

async function operator() {
	const person = await signUp('ops', 'Оператор')
	await db.update(users).set({ platformRole: 'operator' }).where(eq(users.id, person.id))
	return person
}

/** Включить второй фактор: пароль → ссылка otpauth → код из «приложения». */
async function enable2fa(cookie: string) {
	const res = await call('POST', '/api/auth/two-factor/enable', { cookie, body: { password: TEST_PASSWORD } })
	expect(res.status).toBe(200)
	const { totpURI } = (await res.json()) as { totpURI: string }
	const verify = await call('POST', '/api/auth/two-factor/verify-totp', { cookie, body: { code: totp(totpURI) } })
	expect(verify.status).toBe(200)
	// включение второго фактора заменяет сессию — дальше работаем с новой
	const session = (verify.headers.getSetCookie?.() ?? [])
		.map((c) => c.split(';')[0])
		.find((c) => c?.includes('session_token'))
	return { uri: totpURI, cookie: session ?? cookie }
}

describe('консоль оператора', () => {
	it('не оператор и не корневой домен — 404; без второго фактора — только «кто я»', async () => {
		const t = await withTestSchool()
		expect(await fails(clientFor(t.people.owner.cookie).ops.me())).toMatchObject({ status: 404 })
		expect(await fails(clientFor(null).ops.me())).toMatchObject({ status: 401 })
		const ops = await operator()
		expect(await fails(clientFor(ops.cookie, t.school.slug).ops.me())).toMatchObject({ status: 404 })
		const root = clientFor(ops.cookie)
		expect(await root.ops.me()).toMatchObject({ email: ops.email, twoFactorEnabled: false })
		expect(
			await fails(root.ops.schools.create({ name: 'Школа', slug: uniqueSlug(), ownerEmail: 'o@test.local' })),
		).toEqual({
			status: 403,
			code: 'OPS_2FA_REQUIRED',
		})
		expect(findOperatorProceduresWithout2fa(router)).toEqual(['ops.me'])
	})

	it('второй фактор: включение по коду; вход паролем требует код; ссылка для входа оператору не уходит', async () => {
		const ops = await operator()
		const { uri, cookie } = await enable2fa(ops.cookie)
		expect(await clientFor(cookie).ops.me()).toMatchObject({ twoFactorEnabled: true })

		const signIn = await call('POST', '/api/auth/sign-in/email', {
			body: { email: ops.email, password: TEST_PASSWORD },
		})
		expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true })
		const pending = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
		const verified = await call('POST', '/api/auth/two-factor/verify-totp', {
			cookie: pending,
			body: { code: totp(uri) },
		})
		expect(verified.status).toBe(200)

		const before = memoryOutbox.length
		await call('POST', '/api/auth/sign-in/magic-link', { body: { email: ops.email, callbackURL: '/' } })
		await drainJobs()
		expect(memoryOutbox.slice(before).filter((m) => m.to === ops.email)).toEqual([])
	})

	it('создание школы: приглашение владельца; владелец принимает оферту и политику; журнал консоли', async () => {
		const ops = await operator()
		const { cookie } = await enable2fa(ops.cookie)
		const root = clientFor(cookie)
		const slug = uniqueSlug()
		const owner = await signUp('owner', 'Новый Владелец')
		const created = await root.ops.schools.create({ name: 'Школа из консоли', slug, ownerEmail: owner.email })
		expect(created).toMatchObject({ slug, url: `http://${slug}.dinastia.localhost:5173` })
		expect(await fails(root.ops.schools.create({ name: 'Дубль', slug, ownerEmail: owner.email }))).toMatchObject({
			code: 'SLUG_TAKEN',
		})

		const token = await inviteToken(owner.email)
		const school = clientFor(owner.cookie, slug)
		expect(await clientFor(null, slug).invitations.get({ token })).toMatchObject({ role: 'owner' })
		expect(await school.invitations.accept({ token, consent: true })).toMatchObject({ role: 'owner' })
		expect(await school.schools.me()).toMatchObject({ member: { role: 'owner' } })
		const given = await db
			.select({ kind: consents.kind })
			.from(consents)
			.where(and(eq(consents.userId, owner.id), eq(consents.schoolId, created.id)))
		expect(given.map((g) => g.kind).sort()).toEqual(['offer', 'privacy'])

		expect((await findSchoolBySlug(slug))?.createdByOperatorId).toBe(ops.id)
		const log = await db.select().from(opsAudit).where(eq(opsAudit.schoolId, created.id))
		expect(log).toMatchObject([{ operatorId: ops.id, action: 'ops.school.created' }])
		expect(JSON.stringify(log)).not.toContain(owner.email)
	})
})

describe('школы, люди, журнал (5.6б)', () => {
	it('список с метриками из задачи, поиск по почте владельца; карточка — метрики сейчас, сотрудники, журнал', async () => {
		const ops = await operator()
		const { cookie } = await enable2fa(ops.cookie)
		const root = clientFor(cookie)
		const t = await withTestSchool('Школа метрик')
		await t.as('teacher').courses.create({ title: 'Курс метрик' })

		// без задачи метрик — нули
		const before = await root.ops.schools.list({ q: t.school.slug })
		expect(before.items).toMatchObject([{ id: t.school.id, students: 0, ownerEmail: null }])

		// задача ops.school-stats делает то же для каждой школы
		await withTenant(t.school.id, (tx) => refreshSchoolStats(tenantCtx(tx, t.school, { now: () => new Date(), log })))
		const after = await root.ops.schools.list({ q: t.people.owner.email })
		expect(after.items).toMatchObject([
			{ id: t.school.id, students: 1, courses: 1, ownerEmail: t.people.owner.email, status: 'active' },
		])

		const card = await root.ops.schools.get({ id: t.school.id })
		expect(card).toMatchObject({ name: 'Школа метрик', students: 1, courses: 1 })
		expect(card.staff.map((s) => s.role).sort()).toEqual(['admin', 'curator', 'owner', 'teacher'])
		expect(await fails(root.ops.schools.get({ id: crypto.randomUUID() }))).toMatchObject({ code: 'SCHOOL_NOT_FOUND' })
	})

	it('человек по точной почте: школы и роли; не найден — null; поиск в журнале без почты', async () => {
		const ops = await operator()
		const { cookie } = await enable2fa(ops.cookie)
		const root = clientFor(cookie)
		const t = await withTestSchool('Школа поиска')
		const found = await root.ops.people.find({ email: t.people.teacher.email.toUpperCase() })
		expect(found).toMatchObject({
			email: t.people.teacher.email,
			schools: [{ id: t.school.id, role: 'teacher', status: 'active' }],
		})
		expect(await root.ops.people.find({ email: 'nobody-here@test.local' })).toBeNull()
		const log = await root.ops.audit.list({})
		expect(log.items.filter((r) => r.action === 'ops.person.searched').length).toBeGreaterThanOrEqual(2)
		expect(JSON.stringify(log)).not.toContain(t.people.teacher.email)
	})
})

describe('приостановка школы (5.6в)', () => {
	it('приостановлена: владелец входит с причиной, остальные и гость — SCHOOL_SUSPENDED; письмо; журнал школы; возобновление', async () => {
		const ops = await operator()
		const { cookie } = await enable2fa(ops.cookie)
		const root = clientFor(cookie)
		const t = await withTestSchool('Школа на паузе')
		expect(await fails(root.ops.schools.suspend({ id: t.school.id, reason: '' }))).toMatchObject({ status: 400 })

		const card = await root.ops.schools.suspend({ id: t.school.id, reason: 'Не оплачен тариф' })
		expect(card).toMatchObject({ status: 'suspended', suspendedReason: 'Не оплачен тариф' })
		expect(await fails(root.ops.schools.suspend({ id: t.school.id, reason: 'ещё раз' }))).toMatchObject({
			code: 'SCHOOL_NOT_ACTIVE',
		})

		for (const role of ['admin', 'teacher', 'student'] as const)
			expect(await fails(t.as(role).schools.me())).toMatchObject({ status: 403, code: 'SCHOOL_SUSPENDED' })
		const guest = await t
			.as('guest')
			.schools.current()
			.catch((e: ORPCError<string, { schoolName?: string }>) => e.data)
		expect(guest).toMatchObject({ code: 'SCHOOL_SUSPENDED', schoolName: 'Школа на паузе' })
		expect(await t.as('owner').schools.me()).toMatchObject({ suspension: { reason: 'Не оплачен тариф' } })

		const mail = await lastMailTo(t.people.owner.email)
		expect(mail.subject).toBe('Школа «Школа на паузе» приостановлена')
		expect(mail.text).toContain('Причина: Не оплачен тариф')

		// «Мои школы»: владелец видит приостановленную, сотрудник — нет
		expect((await clientFor(t.people.owner.cookie).schools.mine()).find((s) => s.id === t.school.id)).toMatchObject({
			suspended: true,
		})
		expect((await clientFor(t.people.teacher.cookie).schools.mine()).find((s) => s.id === t.school.id)).toBeUndefined()

		const [entry] = await withTenant(t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.action, 'schools.school.suspended')),
		)
		expect(entry).toMatchObject({ actorMemberId: null, diff: { operatorId: ops.id, reason: 'Не оплачен тариф' } })

		expect(await root.ops.schools.resume({ id: t.school.id })).toMatchObject({
			status: 'active',
			suspendedReason: null,
		})
		expect(await t.as('student').schools.me()).toMatchObject({ suspension: null })
		expect((await lastMailTo(t.people.owner.email)).subject).toBe('Школа «Школа на паузе» снова работает')
	})
})
