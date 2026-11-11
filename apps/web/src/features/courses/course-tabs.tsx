// Вкладки курса: «Содержание» (конструктор), «Вопросы» (банк, 3.1), «Ученики» (4.1), «Потоки» (4.2), «Аналитика» (4.6),
// «Сертификат» (4.7) — ссылки между экранами курса.
import { cn } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { meQuery } from '#/app/queries.ts'

const LINK =
	'rounded px-3 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function CourseTabs({
	courseId,
	active,
	actions,
}: {
	courseId: string
	active: 'content' | 'questions' | 'learners' | 'groups' | 'analytics' | 'certificate'
	/** Справа от вкладок — действия экрана. */
	actions?: ReactNode
}) {
	const { t } = useTranslation('courses')
	const { data: me } = useQuery(meQuery())
	const canBank = me?.permissions.includes('assessments.bank.read') ?? false
	const canLearners = me?.permissions.includes('learning.read') ?? false
	const canAnalytics = me?.permissions.includes('learning.analytics') ?? false
	const canCertificate = me?.permissions.includes('certificates.view') ?? false
	if (!canBank && !canLearners && !canAnalytics && !canCertificate && !actions) return null
	return (
		<div className="flex flex-wrap items-center gap-2 border-b pb-2" data-testid="course-tabs">
			<nav className="flex flex-wrap gap-1" aria-label={t('tabs.label')}>
				<Link
					to="/admin/courses/$courseId"
					params={{ courseId }}
					aria-current={active === 'content' ? 'page' : undefined}
					className={cn(LINK, active === 'content' && 'bg-accent font-medium')}
					data-testid="course-tab-content"
				>
					{t('tabs.content')}
				</Link>
				{canBank && (
					<Link
						to="/admin/courses/$courseId/questions"
						params={{ courseId }}
						aria-current={active === 'questions' ? 'page' : undefined}
						className={cn(LINK, active === 'questions' && 'bg-accent font-medium')}
						data-testid="course-tab-questions"
					>
						{t('tabs.questions')}
					</Link>
				)}
				{canLearners && (
					<Link
						to="/admin/courses/$courseId/learners"
						params={{ courseId }}
						aria-current={active === 'learners' ? 'page' : undefined}
						className={cn(LINK, active === 'learners' && 'bg-accent font-medium')}
						data-testid="course-tab-learners"
					>
						{t('tabs.learners')}
					</Link>
				)}
				{canLearners && (
					<Link
						to="/admin/courses/$courseId/groups"
						params={{ courseId }}
						aria-current={active === 'groups' ? 'page' : undefined}
						className={cn(LINK, active === 'groups' && 'bg-accent font-medium')}
						data-testid="course-tab-groups"
					>
						{t('tabs.groups')}
					</Link>
				)}
				{canAnalytics && (
					<Link
						to="/admin/courses/$courseId/analytics"
						params={{ courseId }}
						aria-current={active === 'analytics' ? 'page' : undefined}
						className={cn(LINK, active === 'analytics' && 'bg-accent font-medium')}
						data-testid="course-tab-analytics"
					>
						{t('tabs.analytics')}
					</Link>
				)}
				{canCertificate && (
					<Link
						to="/admin/courses/$courseId/certificate"
						params={{ courseId }}
						aria-current={active === 'certificate' ? 'page' : undefined}
						className={cn(LINK, active === 'certificate' && 'bg-accent font-medium')}
						data-testid="course-tab-certificate"
					>
						{t('tabs.certificate')}
					</Link>
				)}
			</nav>
			{actions && <div className="flex gap-2 sm:ml-auto">{actions}</div>}
		</div>
	)
}
