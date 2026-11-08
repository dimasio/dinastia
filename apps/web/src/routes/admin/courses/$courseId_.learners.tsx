import { resourceKey, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { Learners } from '#/features/learning/learners.tsx'

// Ученики курса (карточка 4.1): читают сотрудники с learning.read, зачисляют — с learning.enroll.
export const Route = createFileRoute('/admin/courses/$courseId_/learners')({
	validateSearch: resourceSearch,
	beforeLoad: (args) => {
		requirePerm('learning.read')(args)
		// кэш списка общий у ресурса всех курсов — не показываем учеников прежнего курса
		args.context.queryClient.removeQueries({ queryKey: resourceKey('enrollments') })
	},
	component: () => {
		const { courseId } = Route.useParams()
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <Learners courseId={courseId} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
