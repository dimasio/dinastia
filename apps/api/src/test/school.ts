// Фикстура «школа с участниками всех ролей» (скилл testing): HTTP-сессии и типизированные клиенты от имени ролей.
import type { Contract } from '@dinastia/contracts'
import type { MemberRole } from '@dinastia/contracts/schools'
import { schools } from '@dinastia/db'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { inArray } from 'drizzle-orm'
import { expect } from 'vitest'
import { db } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { members } from '#/kernel/members/schema.ts'
import { app, call, host, signUp } from './http.ts'
import { uniqueSlug } from './users.ts'

export type Client = ContractRouterClient<Contract>
export const ROLES = ['owner', 'admin', 'teacher', 'curator', 'student'] as const satisfies readonly MemberRole[]

interface Person {
	id: string
	email: string
	cookie: string
}

export interface TestSchool {
	school: { id: string; slug: string; name: string }
	people: Record<MemberRole, Person>
	/** Типизированный клиент API от имени роли (через /api/rpc на хосте школы). */
	as: (role: MemberRole | 'guest' | Person) => Client
	/** Удалить школу и всё её (каскадом). */
	cleanup: () => Promise<void>
}

const createdSchools: string[] = []

/** Клиент API от имени сессии (cookie) на хосте школы или корня. */
export function clientFor(cookie: string | null, slug?: string): Client {
	const h = host(slug)
	return createORPCClient(
		new RPCLink({
			url: `http://${h}/api/rpc`,
			fetch: async (r) => {
				const headers = new Headers(r.headers)
				headers.set('host', h)
				headers.set('origin', `http://${h}`)
				if (cookie) headers.set('cookie', cookie)
				return app.request(new URL(r.url).pathname, { method: r.method, headers, body: await r.text() })
			},
		}),
	)
}

/** Новая школа: владелец регистрирует её через API, остальные роли добавляются участниками. */
export async function withTestSchool(name = 'Тестовая школа'): Promise<TestSchool> {
	const owner = await signUp('owner', 'Ольга Владелец')
	const res = await call('POST', '/api/v1/schools', { cookie: owner.cookie, body: { name, slug: uniqueSlug('t') } })
	if (res.status !== 201) throw new Error(`школа не создана: ${res.status} ${await res.text()}`)
	const school = (await res.json()) as { id: string; slug: string; name: string }
	createdSchools.push(school.id)

	const people = { owner } as Record<MemberRole, Person>
	for (const role of ROLES.filter((r) => r !== 'owner')) {
		const p = await signUp(role)
		await withTenant(school.id, (tx) => tx.insert(members).values({ userId: p.id, role }))
		people[role] = p
	}
	return {
		school,
		people,
		as: (who) => {
			if (who === 'guest') return clientFor(null, school.slug)
			const p = typeof who === 'string' ? people[who] : who
			return clientFor(p.cookie, school.slug)
		},
		cleanup: async () => {
			await db.delete(schools).where(inArray(schools.id, [school.id]))
		},
	}
}

/** Удалить все школы, созданные фикстурой в этом файле тестов (afterAll). */
export async function cleanupTestSchools() {
	if (createdSchools.length) await db.delete(schools).where(inArray(schools.id, createdSchools.splice(0)))
}

/**
 * Матрица прав процедуры (скилл permissions): роли из deny получают 403 NO_PERMISSION; роли из allow — не 403/401
 * (бизнес-ошибки допустимы — проверяется именно право). Роли, не указанные ни там, ни там, — ошибка теста.
 */
export async function expectPermissionMatrix(
	t: TestSchool,
	procedure: (client: Client) => Promise<unknown>,
	matrix: { allow: readonly MemberRole[]; deny: readonly MemberRole[] },
) {
	const missing = ROLES.filter((r) => !matrix.allow.includes(r) && !matrix.deny.includes(r))
	expect(missing, 'каждая роль должна быть в allow или deny').toEqual([])
	for (const role of ROLES) {
		const error = await procedure(t.as(role)).then(
			() => null,
			(e: unknown) => e,
		)
		const status = error instanceof ORPCError ? error.status : null
		const code = error instanceof ORPCError ? (error.data as { code?: string })?.code : null
		if (matrix.deny.includes(role)) {
			expect({ role, status, code }).toEqual({ role, status: 403, code: 'NO_PERMISSION' })
		} else {
			expect({ role, denied: status === 403 || status === 401 }, `${role}: ${code ?? ''}`).toEqual({
				role,
				denied: false,
			})
		}
	}
}
