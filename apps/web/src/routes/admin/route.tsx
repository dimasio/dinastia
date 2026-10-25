import { ResourceProvider } from '@dinastia/ui/resource'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { requireMember } from '#/app/guards.ts'
import { AdminShell } from '#/app/layout/admin-shell.tsx'

export const Route = createFileRoute('/admin')({
	beforeLoad: async ({ context, location }) => ({
		me: await requireMember(context.queryClient, { staff: true, href: location.href }),
	}),
	component: () => {
		const { me } = Route.useRouteContext()
		const { t } = useTranslation('errors')
		return (
			<AdminShell me={me}>
				<ResourceProvider
					viewer={{ memberId: me.member.id, role: me.member.role, permissions: me.permissions }}
					errorText={(error) => t(errorText(error))}
				>
					<Outlet />
				</ResourceProvider>
			</AdminShell>
		)
	},
})
