import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { opsSchoolsResource } from '#/features/ops/resources.tsx'

export const Route = createFileRoute('/ops/')({
	validateSearch: resourceSearch,
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<ResourcePage
				resource={opsSchoolsResource}
				search={search}
				onSearch={(s) => navigate({ search: s, replace: true })}
			/>
		)
	},
})
