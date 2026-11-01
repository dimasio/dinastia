import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { CourseBuilder } from '#/features/courses/builder/course-builder.tsx'

// Карточка курса — вкладка «Содержание» (конструктор, карточка 2.2); правки — только с courses.manage.
export const Route = createFileRoute('/admin/courses/$courseId')({
	beforeLoad: requirePerm('courses.read'),
	component: () => {
		const { courseId } = Route.useParams()
		return <CourseBuilder courseId={courseId} />
	},
})
