import { resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { Learners } from '#/features/learning/learners.tsx'

// Ученики курса (карточка 4.1): читают сотрудники с learning.read, зачисляют — с learning.enroll.
export const Route = createFileRoute('/admin/courses/$courseId_/learners')({
	validateSearch: resourceSearch,
	// списки разных курсов в кэше не смешиваются — область ресурса (`scope`) = курс
	beforeLoad: requirePerm('learning.read'),
	component: () => {
		const { courseId } = Route.useParams()
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <Learners courseId={courseId} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
