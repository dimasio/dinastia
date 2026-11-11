import { resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { QuestionBank } from '#/features/assessments/question-bank.tsx'

// Банк вопросов курса (карточка 3.1): читают сотрудники с assessments.bank.read, правят — с assessments.bank.manage.
export const Route = createFileRoute('/admin/courses/$courseId_/questions/')({
	validateSearch: resourceSearch,
	// списки разных курсов в кэше не смешиваются — область ресурса (`scope`) = курс
	beforeLoad: requirePerm('assessments.bank.read'),
	component: () => {
		const { courseId } = Route.useParams()
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <QuestionBank courseId={courseId} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
