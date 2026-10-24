import { EmptyState, PageHeader } from '@dinastia/ui'
import { createFileRoute } from '@tanstack/react-router'
import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/learn/')({
	component: () => {
		const { t } = useTranslation('home')
		return (
			<>
				<PageHeader title={t('learn.title')} />
				<EmptyState icon={GraduationCap} title={t('learn.emptyTitle')} description={t('learn.emptyDescription')} />
			</>
		)
	},
})
