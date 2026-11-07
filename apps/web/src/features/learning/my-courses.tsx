// «Мои курсы» ученика (карточка 2.6): карточки с обложкой и прогрессом.
import { Card, CardContent, EmptyState, PageHeader, Skeleton } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { ProgressBar } from './progress-bar.tsx'

export function MyCourses() {
	const { t } = useTranslation(['learning', 'errors'])
	const courses = useQuery(orpc.learn.courses.list.queryOptions())
	return (
		<>
			<PageHeader title={t('my.title')} />
			{courses.isPending ? (
				<Skeleton className="h-40 w-full" />
			) : courses.error ? (
				<EmptyState icon={GraduationCap} title={t(errorText(courses.error), { ns: 'errors' })} />
			) : courses.data.length === 0 ? (
				<EmptyState icon={GraduationCap} title={t('my.emptyTitle')} description={t('my.emptyDescription')} />
			) : (
				<ul className="grid gap-4 sm:grid-cols-2" data-testid="my-courses">
					{courses.data.map((c) => (
						<li key={c.id}>
							<Link
								to="/learn/courses/$courseId"
								params={{ courseId: c.id }}
								className="block rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
								data-testid="my-course"
							>
								<Card className="h-full overflow-hidden py-0 transition-colors hover:bg-accent/40">
									<div className="aspect-video bg-muted">
										{c.coverUrl && <img src={c.coverUrl} alt="" className="size-full object-cover" />}
									</div>
									<CardContent className="grid gap-2 pb-4">
										<h2 className="font-medium leading-snug">{c.title}</h2>
										{c.expired ? (
											<p className="text-destructive text-sm">{t('my.expired')}</p>
										) : (
											<ProgressBar pct={c.progressPct} label={t('my.progress', { pct: c.progressPct })} />
										)}
									</CardContent>
								</Card>
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	)
}
