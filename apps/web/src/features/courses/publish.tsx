// Публикация (карточка 2.5): статус урока бейджем и разбор ошибок публикации — общие для конструкторов курса и урока.
import { type Lesson, lessonStatus } from '@dinastia/contracts/courses'
import { Badge } from '@dinastia/ui'
import { ORPCError } from '@orpc/client'
import { useTranslation } from 'react-i18next'

/** Статус урока для сотрудников; `hidePublished` — в дереве курса показываем только то, что требует внимания. */
export function LessonStatusBadge(props: {
	lesson: Pick<Lesson, 'publishedAt' | 'hasUnpublishedChanges'>
	hidePublished?: boolean
	testId?: string
}) {
	const { t } = useTranslation('courses')
	const status = lessonStatus(props.lesson)
	if (status === 'published' && props.hidePublished) return null
	return (
		<Badge
			variant={status === 'published' ? 'secondary' : 'outline'}
			className={status === 'changed' ? 'border-amber-500/50 text-amber-700 dark:text-amber-400' : undefined}
			data-testid={props.testId}
			data-status={status}
		>
			{t(`publish.status.${status}`)}
		</Badge>
	)
}

/** Данные ошибки oRPC (`fail.conflict(code, data)` на сервере). */
export const errorData = <T,>(e: unknown): T | undefined =>
	e instanceof ORPCError ? (e.data as T | undefined) : undefined
