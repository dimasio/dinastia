// API целиком: REST (/api/v1) и типизированный oRPC-клиент (/api/rpc) — как их вызовут веб, мобайл и интеграции.
import type { Contract } from '@dinastia/contracts'
import { schools } from '@dinastia/db'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from '#/kernel/db/client.ts'
import { app, call, host, signUp } from '#/test/http.ts'
import { inviteToken, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { uniqueSlug } from '#/test/users.ts'

const created: string[] = []
beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	if (created.length) await db.delete(schools).where(inArray(schools.id, created))
	await pool.end()
})

async function newSchool() {
	const owner = await signUp('owner', 'Ольга')
	const slug = uniqueSlug()
	const res = await call('POST', '/api/v1/schools', { cookie: owner.cookie, body: { name: 'Школа API', slug } })
	expect(res.status).toBe(201)
	const school = (await res.json()) as { id: string; slug: string; url: string }
	created.push(school.id)
	return { owner, school }
}

const json = async (res: Response) => (await res.json()) as Record<string, unknown> & { data?: { code?: string } }

describe('регистрация школы (корневой домен)', () => {
	it('создаёт школу и возвращает её адрес; владелец видит её в «моих школах»', async () => {
		const { owner, school } = await newSchool()
		expect(school.url).toBe(`http://${school.slug}.dinastia.localhost:5173`)
		const mine = (await (await call('GET', '/api/v1/me/schools', { cookie: owner.cookie })).json()) as {
			slug: string
			role: string
		}[]
		expect(mine).toEqual([expect.objectContaining({ slug: school.slug, role: 'owner' })])
	})

	it('без входа — 401; не на корневом домене — 404; кривой slug — 400 с причиной', async () => {
		const u = await signUp()
		expect((await call('POST', '/api/v1/schools', { body: { name: 'Школа', slug: uniqueSlug() } })).status).toBe(401)
		const onSchoolHost = await call('POST', '/api/v1/schools', {
			slug: 'demo',
			cookie: u.cookie,
			body: { name: 'Школа', slug: uniqueSlug() },
		})
		expect(onSchoolHost.status).toBe(404)
		expect((await json(onSchoolHost)).data?.code).toBe('NOT_ON_ROOT_DOMAIN')
		const bad = await call('POST', '/api/v1/schools', { cookie: u.cookie, body: { name: 'Школа', slug: 'admin' } })
		expect(bad.status).toBe(400)
		expect(JSON.stringify(await bad.json())).toContain('SLUG_RESERVED')
	})
})

describe('школа хоста и «кто я»', () => {
	it('публичные сведения о школе по хосту; неизвестный поддомен — 404', async () => {
		const { school } = await newSchool()
		const res = await call('GET', '/api/v1/school', { slug: school.slug })
		expect(await res.json()).toEqual({ id: school.id, slug: school.slug, name: 'Школа API' })
		expect((await call('GET', '/api/v1/school', { slug: 'no-such-school' })).status).toBe(404)
	})

	it('участник получает свою роль; не участник и участник другой школы — 403', async () => {
		const a = await newSchool()
		const b = await newSchool()
		const me = await json(await call('GET', '/api/v1/school/me', { slug: a.school.slug, cookie: a.owner.cookie }))
		expect(me).toMatchObject({ member: { role: 'owner' }, school: { id: a.school.id } })

		const stranger = await signUp('stranger')
		const r1 = await call('GET', '/api/v1/school/me', { slug: a.school.slug, cookie: stranger.cookie })
		expect(r1.status).toBe(403)
		expect((await json(r1)).data?.code).toBe('NOT_A_MEMBER')
		expect((await call('GET', '/api/v1/school/me', { slug: a.school.slug, cookie: b.owner.cookie })).status).toBe(403)
	})
})

describe('приглашения через API', () => {
	it('пригласить → открыть по токену → принять; токен не возвращается в API', async () => {
		const { owner, school } = await newSchool()
		const invitee = await signUp('invitee', 'Иван')
		const created = await call('POST', '/api/v1/school/invitations', {
			slug: school.slug,
			cookie: owner.cookie,
			body: { email: invitee.email, role: 'teacher' },
		})
		expect(created.status).toBe(201)
		const body = await created.json()
		expect(JSON.stringify(body)).not.toMatch(/token|invite\//)

		const link = await inviteToken(invitee.email)
		const info = await json(await call('GET', `/api/v1/invitations/${link}`, { slug: school.slug }))
		expect(info).toMatchObject({ role: 'teacher', email: invitee.email, school: { slug: school.slug } })

		const accept = await call('POST', `/api/v1/invitations/${link}/accept`, {
			slug: school.slug,
			cookie: invitee.cookie,
			body: {},
		})
		expect(await json(accept)).toMatchObject({ role: 'teacher' })
		const me = await json(await call('GET', '/api/v1/school/me', { slug: school.slug, cookie: invitee.cookie }))
		expect(me).toMatchObject({ member: { role: 'teacher' } })
		expect((me.permissions as string[]).filter((p) => p.startsWith('schools.'))).toEqual([
			'schools.access',
			'schools.members.read',
		])

		// учитель не может приглашать: сервер запрещает, даже если UI кнопку не спрятал
		const denied = await call('POST', '/api/v1/school/invitations', {
			slug: school.slug,
			cookie: invitee.cookie,
			body: { email: `t-${Date.now()}@test.local`, role: 'curator' },
		})
		expect(denied.status).toBe(403)
		expect((await json(denied)).data).toMatchObject({ code: 'NO_PERMISSION', permission: 'schools.members.manage' })
	})

	it('бизнес-ошибка сервиса приходит кодом, а не 500', async () => {
		const { owner, school } = await newSchool()
		const res = await call('POST', '/api/v1/school/invitations', {
			slug: school.slug,
			cookie: owner.cookie,
			body: { email: `x-${Date.now()}@test.local`, role: 'owner' },
		})
		expect(res.status).toBe(400) // owner не входит в StaffInviteRole — отсекает схема контракта
		const self = await call('POST', '/api/v1/school/invitations', {
			slug: school.slug,
			cookie: owner.cookie,
			body: { email: owner.email, role: 'teacher' },
		})
		expect(self.status).toBe(409)
		expect((await json(self)).data?.code).toBe('ALREADY_MEMBER')
	})
})

describe('типизированный клиент oRPC', () => {
	it('тот же контракт через /api/rpc: типы и ошибки', async () => {
		const { owner, school } = await newSchool()
		const client: ContractRouterClient<Contract> = createORPCClient(
			new RPCLink({
				url: `http://${host(school.slug)}/api/rpc`,
				fetch: async (r) => {
					const headers = new Headers(r.headers)
					headers.set('host', host(school.slug))
					headers.set('cookie', owner.cookie)
					headers.set('origin', `http://${host(school.slug)}`)
					return app.request(new URL(r.url).pathname, { method: r.method, headers, body: await r.text() })
				},
			}),
		)
		const me = await client.schools.me()
		expect(me.member.role).toBe('owner')
		const err = await client.invitations.get({ token: 'x'.repeat(30) }).catch((e) => e)
		expect(err).toBeInstanceOf(ORPCError)
		expect((err as ORPCError<string, { code: string }>).data.code).toBe('INVITATION_NOT_FOUND')
	})
})

describe('OpenAPI', () => {
	it('спецификация описывает все процедуры', async () => {
		const spec = (await (await app.request('/api/openapi.json')).json()) as { paths: Record<string, unknown> }
		expect(Object.keys(spec.paths).sort()).toEqual(
			[
				'/invitations/{token}',
				'/invitations/{token}/accept',
				'/me/schools',
				'/school',
				'/school/invitations',
				'/school/files',
				'/school/files/{id}/complete',
				'/school/me',
				'/school/me/avatar',
				'/school/members',
				'/school/members/{id}/role',
				'/school/members/{id}/status',
				'/schools',
				'/courses',
				'/courses/{id}',
				'/courses/{id}/archive',
				'/courses/{id}/publish',
				'/courses/{id}/publish-changes',
				'/courses/{courseId}/sections',
				'/courses/{courseId}/enrollments',
				'/enrollments/{id}/extend',
				'/enrollments/{id}/unlimit',
				'/enrollments/{id}/revoke',
				'/enrollments/{id}/restore',
				'/sections/{id}',
				'/sections/{id}/move',
				'/sections/{sectionId}/lessons',
				'/lessons/{id}',
				'/lessons/{id}/move',
				'/lessons/{id}/settings',
				'/lessons/{id}/publish',
				'/lessons/{lessonId}/blocks',
				'/assignment/submissions/{submissionId}/review',
				'/assignment/{lessonId}/{blockKey}',
				'/assignment/{lessonId}/{blockKey}/draft',
				'/assignment/{lessonId}/{blockKey}/reply',
				'/assignment/{lessonId}/{blockKey}/submit',
				'/review/attempts/{attemptId}',
				'/review/attempts/{attemptId}/grades',
				'/review/submissions',
				'/review/submissions/{submissionId}',
				'/review/submissions/{submissionId}/comments',
				'/blocks/{id}',
				'/blocks/{id}/move',
				'/blocks/{id}/video-status',
				'/blocks/{id}/video-upload',
				'/courses/{courseId}/questions',
				'/courses/{courseId}/question-tags',
				'/questions/lookup',
				'/questions/{id}',
				'/questions/{id}/archive',
				'/question-tags/{id}',
				'/quiz/attempts/{attemptId}',
				'/quiz/attempts/{attemptId}/answers',
				'/quiz/attempts/{attemptId}/result',
				'/quiz/attempts/{attemptId}/submit',
				'/quiz/{lessonId}/{blockKey}',
				'/quiz/{lessonId}/{blockKey}/attempts',
				'/learn/courses',
				'/learn/courses/{courseId}',
				'/learn/lessons/{lessonId}',
				'/learn/lessons/{lessonId}/complete',
				'/learn/lessons/{lessonId}/open',
			].sort(),
		)
	})
})
