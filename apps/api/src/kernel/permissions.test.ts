import { describe, expect, it } from 'vitest'
import { impl, mw } from '#/kernel/orpc.ts'
import { can, permissionMap, rolePermissions } from '#/permissions.ts'
import { router } from '#/router.ts'
import { definePermissions, hasPermission, mergePermissions } from './permissions.ts'
import { findProceduresWithoutPermission, findPublicProcedures } from './router-guard.ts'

describe('матрица прав (domain.md §2)', () => {
	it.each([
		[
			'owner',
			['schools.access', 'schools.delete', 'schools.members.manage', 'schools.members.read', 'schools.settings.manage'],
		],
		['admin', ['schools.access', 'schools.members.manage', 'schools.members.read', 'schools.settings.manage']],
		['teacher', ['schools.access', 'schools.members.read']],
		['curator', ['schools.access']],
		['student', ['schools.access']],
	] as const)('%s', (role, expected) => {
		// матрица модуля schools: новые модули не ломают её (у каждого — своя)
		expect(rolePermissions(role).filter((p) => p.startsWith('schools.'))).toEqual([...expected])
	})

	it('owner неявно имеет любое разрешение', () => {
		for (const p of Object.keys(permissionMap) as (keyof typeof permissionMap)[]) {
			expect(hasPermission(permissionMap, 'owner', p)).toBe(true)
		}
	})
})

describe('реестр разрешений', () => {
	it('дубль разрешения и неизвестная роль — ошибка при старте', () => {
		const a = definePermissions('x', { read: ['admin'] })
		expect(() => mergePermissions(a, a)).toThrow(/дважды/)
		expect(() => mergePermissions(definePermissions('y', { read: ['boss' as 'admin'] }))).toThrow(/неизвестная роль/)
	})
})

describe('страж: у каждой процедуры участника есть право', () => {
	it('во всём API', () => {
		expect(findProceduresWithoutPermission(router)).toEqual([])
	})

	it('ловит процедуру без can()', () => {
		const leaky = {
			ok: impl.schools.me
				.use(mw.host)
				.use(mw.session)
				.use(mw.school)
				.use(mw.tenantTx)
				.use(mw.member)
				.use(can('schools.access'))
				.handler(() => {
					throw new Error('не вызывается')
				}),
			bad: impl.schools.me
				.use(mw.host)
				.use(mw.session)
				.use(mw.school)
				.use(mw.tenantTx)
				.use(mw.member)
				.handler(() => {
					throw new Error('не вызывается')
				}),
		}
		expect(findProceduresWithoutPermission(leaky)).toEqual(['bad'])
	})
})

describe('публичные процедуры (5.1)', () => {
	it('список зафиксирован: новая процедура без участия в школе — только после разбора (лимит, что отдаёт, перебор)', () => {
		// session: true — нужен вход (любой пользователь), false — открыто гостю; у каждой — лимит или нечего перебирать
		expect(findPublicProcedures(router)).toEqual([
			{ path: 'schools.create', session: true }, // регистрация школы: лимит 5 в час на пользователя
			{ path: 'schools.mine', session: true }, // свои школы пользователя
			{ path: 'schools.current', session: false }, // название школы хоста — публично
			{ path: 'invitations.get', session: false }, // по токену (хэш в БД), лимит по IP
			{ path: 'invitations.accept', session: true }, // по токену, лимит на пользователя
			{ path: 'join.get', session: false }, // по токену, лимит по IP
			{ path: 'join.accept', session: true }, // по токену, лимит на пользователя
			{ path: 'certificates.verify', session: false }, // имя скрыто без кода из QR, лимит по IP (4.7)
		])
	})
})
