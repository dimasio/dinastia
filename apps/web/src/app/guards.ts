import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { httpStatus } from './errors.ts'
import { currentHost } from './host.ts'
import { meQuery } from './queries.ts'

/**
 * Защита областей (скилл web-screens): только на поддомене школы, только вошедшему участнику.
 * `staff` — область admin (ученика отправляем в learn). Сервер всё равно проверяет права сам.
 */
export async function requireMember(queryClient: QueryClient, opts: { staff?: boolean; href: string }) {
	if (currentHost().kind !== 'school') throw redirect({ to: '/' })
	try {
		const me = await queryClient.ensureQueryData(meQuery())
		if (opts.staff && me.member.role === 'student') throw redirect({ to: '/learn' })
		return me
	} catch (error) {
		if (httpStatus(error) === 401) throw redirect({ to: '/login', search: { redirect: opts.href } })
		throw error
	}
}
