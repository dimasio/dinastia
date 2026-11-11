import { Skeleton } from '@dinastia/ui'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { SchoolCard } from '#/features/ops/school-card.tsx'

export const Route = createFileRoute('/ops/schools/$id')({
	component: () => {
		const { id } = Route.useParams()
		return (
			<Suspense fallback={<Skeleton className="h-96" />}>
				<SchoolCard id={id} />
			</Suspense>
		)
	},
})
