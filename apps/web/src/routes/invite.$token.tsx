import { Skeleton } from '@dinastia/ui'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { InvitePage } from '#/features/invite/invite-page.tsx'

export const Route = createFileRoute('/invite/$token')({
	beforeLoad: () => {
		if (currentHost().kind !== 'school') throw redirect({ to: '/' })
	},
	component: () => {
		const { token } = Route.useParams()
		return (
			<Centered>
				<Suspense fallback={<Skeleton className="h-48 w-full max-w-md" />}>
					<InvitePage token={token} />
				</Suspense>
			</Centered>
		)
	},
})
