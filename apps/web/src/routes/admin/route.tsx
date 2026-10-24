import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireMember } from '#/app/guards.ts'
import { AdminShell } from '#/app/layout/admin-shell.tsx'

export const Route = createFileRoute('/admin')({
	beforeLoad: async ({ context, location }) => ({
		me: await requireMember(context.queryClient, { staff: true, href: location.href }),
	}),
	component: () => {
		const { me } = Route.useRouteContext()
		return (
			<AdminShell me={me}>
				<Outlet />
			</AdminShell>
		)
	},
})
