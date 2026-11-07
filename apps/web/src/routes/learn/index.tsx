import { createFileRoute } from '@tanstack/react-router'
import { MyCourses } from '#/features/learning/my-courses.tsx'

export const Route = createFileRoute('/learn/')({
	component: MyCourses,
})
