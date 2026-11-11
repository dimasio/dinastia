import { resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { CertificateTab } from '#/features/certificates/certificate-tab.tsx'

// Сертификат курса (карточка 4.7): шаблон — certificates.manage, выданные — certificates.view (куратор — свои потоки).
export const Route = createFileRoute('/admin/courses/$courseId_/certificate')({
	validateSearch: resourceSearch,
	beforeLoad: requirePerm('certificates.view'),
	component: () => {
		const { courseId } = Route.useParams()
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<CertificateTab courseId={courseId} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
		)
	},
})
