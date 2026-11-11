import { Button, EmptyState } from '@dinastia/ui'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { CircleAlert, SearchX } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { reportError } from '#/app/error-report.ts'
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
	// неожиданная ошибка экрана — в сбор ошибок (5.4); ошибки API с кодом — ожидаемые
	useEffect(() => {
		if (code === 'UNKNOWN') reportError(error)
	}, [code, error])
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
