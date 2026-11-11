import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { staffResource } from '#/features/schools/resources/staff.ts'

export const Route = createFileRoute('/admin/staff/')({
	validateSearch: resourceSearch,
	// право строкой, а не `staffResource.perms.read`: beforeLoad — в начальной загрузке, ресурс (и zod) — в чанке экрана (5.2)
	beforeLoad: requirePerm('schools.members.read'),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<ResourcePage resource={staffResource} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
		)
	},
})
