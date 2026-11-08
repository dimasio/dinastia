import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { AttemptReviewScreen } from '#/features/assessments/review/attempt-review.tsx'

// Проверка попытки теста с ручными вопросами (карточка 3.6).
export const Route = createFileRoute('/admin/review/attempts/$attemptId')({
	beforeLoad: requirePerm('assessments.review'),
	component: () => <AttemptReviewScreen attemptId={Route.useParams().attemptId} />,
})
