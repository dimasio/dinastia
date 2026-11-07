import { createFileRoute } from '@tanstack/react-router'
import { CoursePage } from '#/features/learning/course-page.tsx'

export const Route = createFileRoute('/learn/courses/$courseId')({
	component: () => <CoursePage courseId={Route.useParams().courseId} />,
})
