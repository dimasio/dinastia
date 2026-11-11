import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { opsAuditResource } from '#/features/ops/resources.tsx'

export const Route = createFileRoute('/ops/audit')({
	validateSearch: resourceSearch,
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<ResourcePage
				resource={opsAuditResource}
				search={search}
				onSearch={(s) => navigate({ search: s, replace: true })}
			/>
		)
	},
})
