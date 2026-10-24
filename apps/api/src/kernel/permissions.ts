// Права (скилл permissions): разрешение `<модуль>.<действие>` → роли. owner неявно имеет все разрешения.
// Модуль объявляет definePermissions в modules/<m>/permissions.ts, сводный реестр — src/permissions.ts.
import { MEMBER_ROLES, type MemberRole } from '@dinastia/contracts/schools'
import { ORPCError, os } from '@orpc/server'
import type { RequestCtx } from './orpc.ts'

type Roles = readonly Exclude<MemberRole, 'owner'>[]

export interface ModulePermissions<K extends string> {
	readonly module: string
	readonly entries: Readonly<Record<K, Roles>>
}

export function definePermissions<M extends string, A extends string>(
	module: M,
	actions: Record<A, Roles>,
): ModulePermissions<`${M}.${A}`> {
	const entries = Object.fromEntries(Object.entries(actions).map(([a, roles]) => [`${module}.${a}`, roles]))
	return { module, entries: entries as Record<`${M}.${A}`, Roles> }
}

export type PermissionMap<K extends string> = Readonly<Record<K, Roles>>

export function mergePermissions<T extends ModulePermissions<string>[]>(
	...mods: T
): PermissionMap<T[number] extends ModulePermissions<infer K> ? K : never> {
	const all: Record<string, Roles> = {}
	for (const m of mods) {
		for (const [k, roles] of Object.entries(m.entries) as [string, Roles][]) {
			if (all[k]) throw new Error(`разрешение объявлено дважды: ${k}`)
			for (const r of roles) if (!MEMBER_ROLES.includes(r)) throw new Error(`неизвестная роль ${r} в ${k}`)
			all[k] = roles
		}
	}
	return all as never
}

export function hasPermission<K extends string>(map: PermissionMap<K>, role: MemberRole, perm: K): boolean {
	return role === 'owner' || map[perm].includes(role as Exclude<MemberRole, 'owner'>)
}

/** Разрешения роли — для UI (скрыть недоступное; запрещает всё равно сервер). */
export function permissionsOf<K extends string>(map: PermissionMap<K>, role: MemberRole): K[] {
	return (Object.keys(map) as K[]).filter((k) => hasPermission(map, role, k)).sort()
}

/** Middleware, созданные `can()` — по ним тест проверяет, что у каждой процедуры участника есть право. */
export const permissionMiddlewares = new WeakSet<object>()

export function createCan<K extends string>(map: PermissionMap<K>) {
	return function can(perm: K) {
		const middleware = os
			.$context<RequestCtx & { member: { role: MemberRole } }>()
			.middleware(async ({ context, next }) => {
				if (!hasPermission(map, context.member.role, perm)) {
					throw new ORPCError('FORBIDDEN', {
						message: 'NO_PERMISSION',
						data: { code: 'NO_PERMISSION', permission: perm },
					})
				}
				return next({ context: { can: (p: K) => hasPermission(map, context.member.role, p) } })
			})
		permissionMiddlewares.add(middleware)
		return middleware
	}
}
