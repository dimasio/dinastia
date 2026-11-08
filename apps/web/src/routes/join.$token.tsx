import { Skeleton } from '@dinastia/ui'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { JoinPage } from '#/features/learning/join-page.tsx'

// Присоединение к курсу по приглашению (карточка 4.1(б)): публичная страница школы.
export const Route = createFileRoute('/join/$token')({
	beforeLoad: () => {
		if (currentHost().kind !== 'school') throw redirect({ to: '/' })
	},
	component: () => {
		const { token } = Route.useParams()
		return (
			<Centered>
				<Suspense fallback={<Skeleton className="h-48 w-full max-w-md" />}>
					<JoinPage token={token} />
				</Suspense>
			</Centered>
		)
	},
})
