import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { coursesResource } from '#/features/courses/resources/courses.tsx'

export const Route = createFileRoute('/admin/courses/')({
	validateSearch: resourceSearch,
	beforeLoad: requirePerm(coursesResource.perms.read),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<ResourcePage
				resource={coursesResource}
				search={search}
				onSearch={(s) => navigate({ search: s, replace: true })}
			/>
		)
	},
})
