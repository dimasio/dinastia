import { Button, EmptyState } from '@dinastia/ui'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { CircleAlert, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { Centered } from '#/app/layout/centered.tsx'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	component: Outlet,
	notFoundComponent: NotFound,
	errorComponent: ErrorScreen,
})

function NotFound() {
	const { t } = useTranslation()
	return (
		<Centered>
			<EmptyState
				icon={SearchX}
				title={t('notFound.title')}
				description={t('notFound.description')}
				action={
					<Button asChild>
						<Link to="/">{t('notFound.home')}</Link>
					</Button>
				}
			/>
		</Centered>
	)
}

function ErrorScreen({ error }: { error: unknown }) {
	const { t } = useTranslation(['common', 'errors'])
	const code = errorText(error)
	return (
		<Centered>
			<EmptyState
				icon={CircleAlert}
				title={code === 'UNKNOWN' ? t('error.title') : t(code, { ns: 'errors' })}
				description={code === 'UNKNOWN' ? t('error.description') : undefined}
				action={<Button onClick={() => window.location.reload()}>{t('error.retry')}</Button>}
			/>
		</Centered>
	)
}
