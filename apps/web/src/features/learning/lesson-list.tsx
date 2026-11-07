// Оглавление курса ученика: разделы и уроки со статусами; закрытый урок — с причиной (карточка 2.6).
import type { CourseOutline, LockedBy } from '@dinastia/contracts/learning'
import { cn } from '@dinastia/ui'
import { Link } from '@tanstack/react-router'
import { CircleCheck, CircleDashed, Lock, PlayCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const ICON = { locked: Lock, available: CircleDashed, in_progress: PlayCircle, completed: CircleCheck } as const

export function useLockedText() {
	const { t, i18n } = useTranslation('learning')
	return (by: LockedBy | null) =>
		by === null
			? null
			: by.kind === 'lesson'
				? t('course.lockedByLesson', { title: by.title })
				: t('course.lockedByDate', {
						date: new Date(by.at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
					})
}

export function LessonList({
	outline,
	currentId,
	onNavigate,
}: {
	outline: CourseOutline
	currentId?: string
	onNavigate?: () => void
}) {
	const { t } = useTranslation('learning')
	const lockedText = useLockedText()
	return (
		<div className="grid gap-5" data-testid="lesson-list">
			{outline.sections.map((section) => (
				<section key={section.id} className="grid gap-1">
					<h2 className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">{section.title}</h2>
					<ul className="grid">
						{section.lessons.map((lesson) => {
							const Icon = ICON[lesson.status]
							const reason = lockedText(lesson.lockedBy)
							const body = (
								<>
									<Icon
										className={cn('mt-0.5 size-4 shrink-0', lesson.status === 'completed' && 'text-primary')}
										aria-hidden
									/>
									<span className="grid min-w-0 gap-0.5">
										<span className="truncate">{lesson.title}</span>
										<span className="text-muted-foreground text-xs">
											{reason ?? t(`course.status.${lesson.status}`)}
										</span>
									</span>
								</>
							)
							const cls = cn(
								'flex items-start gap-2 rounded-md px-2 py-2 text-sm',
								lesson.id === currentId && 'bg-accent font-medium',
							)
							return (
								<li key={lesson.id} data-testid="lesson-item" data-status={lesson.status}>
									{lesson.status === 'locked' ? (
										<div className={cn(cls, 'text-muted-foreground')} aria-disabled="true">
											{body}
										</div>
									) : (
										<Link
											to="/learn/courses/$courseId/lessons/$lessonId"
											params={{ courseId: outline.course.id, lessonId: lesson.id }}
											onClick={onNavigate}
											className={cn(
												cls,
												'hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
											)}
										>
											{body}
										</Link>
									)}
								</li>
							)
						})}
					</ul>
				</section>
			))}
		</div>
	)
}
