// Инвариант ядра (скилл core-kernel): каждая процедура участника школы (mw.member) объявляет право через can().
import { isProcedure } from '@orpc/server'
import { mw } from './orpc.ts'
import { permissionMiddlewares } from './permissions.ts'

/** Пути процедур роутера, где после mw.member нет middleware из can(). */
export function findProceduresWithoutPermission(router: unknown, path: string[] = []): string[] {
	if (isProcedure(router)) {
		const mws = router['~orpc'].middlewares as readonly object[]
		const memberAt = mws.indexOf(mw.member)
		if (memberAt === -1) return []
		return mws.slice(memberAt + 1).some((m) => permissionMiddlewares.has(m)) ? [] : [path.join('.')]
	}
	if (router && typeof router === 'object') {
		return Object.entries(router).flatMap(([k, v]) => findProceduresWithoutPermission(v, [...path, k]))
	}
	return []
}

/**
 * Процедуры без `mw.member` — доступны без участия в школе (гость или любой вошедший). Список фиксирует тест: новая такая
 * процедура — повод разобрать, что она отдаёт, нужен ли лимит и нельзя ли перебором собрать данные (5.1).
 */
export function findPublicProcedures(router: unknown, path: string[] = []): { path: string; session: boolean }[] {
	if (isProcedure(router)) {
		const mws = router['~orpc'].middlewares as readonly object[]
		if (mws.includes(mw.member) || mws.includes(mw.operator)) return []
		return [{ path: path.join('.'), session: mws.includes(mw.session) }]
	}
	if (router && typeof router === 'object') {
		return Object.entries(router).flatMap(([k, v]) => findPublicProcedures(v, [...path, k]))
	}
	return []
}

/** Процедуры консоли оператора (`mw.operator`) без второго фактора (`mw.operator2fa`) — только `ops.me` (5.6). */
export function findOperatorProceduresWithout2fa(router: unknown, path: string[] = []): string[] {
	if (isProcedure(router)) {
		const mws = router['~orpc'].middlewares as readonly object[]
		return mws.includes(mw.operator) && !mws.includes(mw.operator2fa) ? [path.join('.')] : []
	}
	if (router && typeof router === 'object') {
		return Object.entries(router).flatMap(([k, v]) => findOperatorProceduresWithout2fa(v, [...path, k]))
	}
	return []
}
