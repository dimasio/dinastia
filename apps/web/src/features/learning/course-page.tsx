// Оглавление курса ученика (карточка 2.6).
import { Button, EmptyState, PageHeader, Skeleton } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { LessonList } from './lesson-list.tsx'
import { ProgressBar } from './progress-bar.tsx'

export function CoursePage({ courseId }: { courseId: string }) {
	const { t } = useTranslation(['learning', 'errors'])
	const outline = useQuery(orpc.learn.courses.get.queryOptions({ input: { courseId } }))
	const back = (
		<Link to="/learn" className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline">
			<ArrowLeft className="size-4" aria-hidden />
			{t('course.back')}
		</Link>
	)
	if (outline.isPending) return <Skeleton className="h-64 w-full" />
	if (outline.error) return <EmptyState icon={BookOpen} title={t(errorText(outline.error), { ns: 'errors' })} />
	const o = outline.data
	if (o.course.expired || o.course.revoked)
		return (
			<>
				{back}
				<EmptyState
					icon={Clock}
					title={o.course.revoked ? t('course.revokedTitle') : t('course.expiredTitle')}
					description={o.course.revoked ? t('course.revokedDescription') : t('course.expiredDescription')}
				/>
			</>
		)
	return (
		<>
			{back}
			<PageHeader
				title={o.course.title}
				actions={
					o.nextLessonId ? (
						<Button asChild>
							<Link
								to="/learn/courses/$courseId/lessons/$lessonId"
								params={{ courseId, lessonId: o.nextLessonId }}
								data-testid="course-continue"
							>
								{t('course.continue')}
							</Link>
						</Button>
					) : undefined
				}
			/>
			<div className="mb-6 max-w-sm">
				<ProgressBar
					pct={o.course.progressPct}
					label={o.course.progressPct === 100 ? t('course.finished') : t('my.progress', { pct: o.course.progressPct })}
				/>
			</div>
			{o.sections.length === 0 ? (
				<EmptyState icon={BookOpen} title={t('course.emptyTitle')} description={t('course.emptyDescription')} />
			) : (
				<LessonList outline={o} />
			)}
		</>
	)
}
