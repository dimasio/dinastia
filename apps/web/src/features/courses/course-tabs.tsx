// Вкладки курса: «Содержание» (конструктор) и «Вопросы» (банк вопросов, карточка 3.1) — ссылки между экранами курса.
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
	active: 'content' | 'questions' | 'learners'
	/** Справа от вкладок — действия экрана. */
	actions?: ReactNode
}) {
	const { t } = useTranslation('courses')
	const { data: me } = useQuery(meQuery())
	const canBank = me?.permissions.includes('assessments.bank.read') ?? false
	const canLearners = me?.permissions.includes('learning.read') ?? false
	if (!canBank && !canLearners && !actions) return null
	return (
		<div className="flex flex-wrap items-center gap-2 border-b pb-2" data-testid="course-tabs">
			<nav className="flex gap-1" aria-label={t('tabs.label')}>
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
			</nav>
			{actions && <div className="flex gap-2 sm:ml-auto">{actions}</div>}
		</div>
	)
}
