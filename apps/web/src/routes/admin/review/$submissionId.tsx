import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { ReviewScreen } from '#/features/assessments/review/review-screen.tsx'

// Экран проверки работы (карточка 3.5).
export const Route = createFileRoute('/admin/review/$submissionId')({
	beforeLoad: requirePerm('assessments.review'),
	component: () => <ReviewScreen submissionId={Route.useParams().submissionId} />,
})
