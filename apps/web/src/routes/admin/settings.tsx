import { Skeleton } from '@dinastia/ui'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { requirePerm } from '#/app/guards.ts'
import { SettingsPage } from '#/features/settings/settings-page.tsx'

export const Route = createFileRoute('/admin/settings')({
	beforeLoad: requirePerm('schools.settings.manage'),
	component: () => (
		<Suspense fallback={<Skeleton className="h-64 w-full" />}>
			<SettingsPage />
		</Suspense>
	),
})
