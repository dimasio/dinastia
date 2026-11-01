import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { LessonEditor } from '#/features/courses/lesson-editor/lesson-editor.tsx'

// Конструктор урока (карточка 2.3): правки — с courses.manage, куратор — только «Как увидит ученик».
export const Route = createFileRoute('/admin/courses/$courseId_/lessons/$lessonId')({
	beforeLoad: requirePerm('courses.read'),
	component: () => {
		const { courseId, lessonId } = Route.useParams()
		return <LessonEditor courseId={courseId} lessonId={lessonId} />
	},
})
