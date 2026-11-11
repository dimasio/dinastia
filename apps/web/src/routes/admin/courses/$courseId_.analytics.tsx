import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { searchString } from '#/app/search.ts'
import { Analytics } from '#/features/learning/analytics.tsx'

// Аналитика курса (карточка 4.6): сводка, воронка по урокам, тесты и задания; куратор — свои потоки.
export const Route = createFileRoute('/admin/courses/$courseId_/analytics')({
	validateSearch: (s: Record<string, unknown>): { group?: string | undefined } => ({
		group: searchString(s.group, 64),
	}),
	beforeLoad: requirePerm('learning.analytics'),
	component: () => {
		const { courseId } = Route.useParams()
		const { group } = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<Analytics
				courseId={courseId}
				groupId={group}
				onGroup={(g) => navigate({ search: { group: g }, replace: true })}
			/>
		)
	},
})
