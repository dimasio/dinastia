import { resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { ReviewQueue } from '#/features/assessments/review/review-queue.tsx'

// Очередь проверки (карточка 3.5): проверяют admin, teacher, curator (assessments.review).
export const Route = createFileRoute('/admin/review/')({
	validateSearch: resourceSearch,
	beforeLoad: requirePerm('assessments.review'),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <ReviewQueue search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
