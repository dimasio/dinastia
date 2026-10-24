import { EmptyState, PageHeader } from '@dinastia/ui'
import { createFileRoute } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/admin/')({
	component: () => {
		const { t } = useTranslation('home')
		const { me } = Route.useRouteContext()
		return (
			<>
				<PageHeader
					title={t('admin.title', { name: me.user.name.split(' ')[0] })}
					description={t('admin.description')}
				/>
				<EmptyState icon={BookOpen} title={t('admin.emptyTitle')} description={t('admin.emptyDescription')} />
			</>
		)
	},
})
