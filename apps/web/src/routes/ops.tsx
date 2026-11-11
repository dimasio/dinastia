import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { currentHost } from '#/app/host.ts'
import { sessionQuery } from '#/app/queries.ts'
import { OpsLayout } from '#/features/ops/ops-layout.tsx'

// Консоль оператора (5.6): только корневой домен; без входа — на главную корня (там форма входа).
export const Route = createFileRoute('/ops')({
	beforeLoad: async ({ context }) => {
		if (currentHost().kind !== 'root') throw notFound()
		if (!(await context.queryClient.ensureQueryData(sessionQuery))) throw redirect({ to: '/' })
	},
	component: () => <OpsLayout notFound={<NotFoundHere />} />,
})

function NotFoundHere(): React.ReactNode {
	throw notFound()
}
