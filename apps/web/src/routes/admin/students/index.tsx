import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { studentsResource } from '#/features/learning/resources/students.ts'

export const Route = createFileRoute('/admin/students/')({
	validateSearch: resourceSearch,
	// право строкой: beforeLoad — в начальной загрузке, ресурс — в чанке экрана (5.2)
	beforeLoad: requirePerm('schools.members.read'),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<ResourcePage
				resource={studentsResource}
				search={search}
				onSearch={(s) => navigate({ search: s, replace: true })}
			/>
		)
	},
})
