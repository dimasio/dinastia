import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireMember } from '#/app/guards.ts'
import { LearnShell } from '#/app/layout/learn-shell.tsx'

export const Route = createFileRoute('/learn')({
	beforeLoad: async ({ context, location }) => ({
		me: await requireMember(context.queryClient, { href: location.href }),
	}),
	component: () => {
		const { me } = Route.useRouteContext()
		return (
			<LearnShell me={me}>
				<Outlet />
			</LearnShell>
		)
	},
})
