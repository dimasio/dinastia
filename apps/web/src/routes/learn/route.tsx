import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireMember } from '#/app/guards.ts'
import { LearnShell } from '#/app/layout/learn-shell.tsx'
import { meQuery } from '#/app/queries.ts'

export const Route = createFileRoute('/learn')({
	beforeLoad: async ({ context, location }) => ({
		me: await requireMember(context.queryClient, { href: location.href }),
	}),
	component: () => {
		// me — из кэша запроса: после смены аватара меню обновится без перезагрузки
		const { me: initial } = Route.useRouteContext()
		const { data: me = initial } = useQuery(meQuery())
		return (
			<LearnShell me={me}>
				<Outlet />
			</LearnShell>
		)
	},
})
