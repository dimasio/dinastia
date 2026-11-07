import { createFileRoute } from '@tanstack/react-router'
import { LessonPlayer } from '#/features/learning/player/lesson-player.tsx'

// Плеер урока ученика (карточка 2.6): доступ проверяет сервер (LESSON_LOCKED / LESSON_NOT_FOUND).
export const Route = createFileRoute('/learn/courses/$courseId_/lessons/$lessonId')({
	component: () => {
		const { courseId, lessonId } = Route.useParams()
		return <LessonPlayer courseId={courseId} lessonId={lessonId} />
	},
})
