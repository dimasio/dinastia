import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { Groups } from '#/features/learning/groups.tsx'

// Потоки курса (карточка 4.2): читают сотрудники с learning.read (куратор — свои), управляют — с learning.groups.manage.
export const Route = createFileRoute('/admin/courses/$courseId_/groups')({
	beforeLoad: requirePerm('learning.read'),
	component: () => {
		const { courseId } = Route.useParams()
		return <Groups courseId={courseId} />
	},
})
