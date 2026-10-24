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
