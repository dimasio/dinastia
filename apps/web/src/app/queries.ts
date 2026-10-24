import { queryOptions } from '@tanstack/react-query'
import { authClient } from './auth.ts'
import { orpc } from './orpc.ts'

/** Текущая сессия (null — не вошёл). */
export const sessionQuery = queryOptions({
	queryKey: ['auth', 'session'],
	queryFn: async () => (await authClient.getSession()).data ?? null,
	staleTime: 60_000,
})

/** Кто я в школе текущего хоста (роль, права). Ошибка 401/403 — нет входа или не участник. */
export const meQuery = () => orpc.schools.me.queryOptions({ staleTime: 60_000, retry: false })

export const currentSchoolQuery = () => orpc.schools.current.queryOptions({ staleTime: 5 * 60_000, retry: false })
