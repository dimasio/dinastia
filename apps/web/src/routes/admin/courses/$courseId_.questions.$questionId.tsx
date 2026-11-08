import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { QuestionEditorPage } from '#/features/assessments/question-editor.tsx'

// Экран вопроса банка (карточка 3.1); `questionId = new` — новый вопрос выбранного типа (`?type=`).
export const Route = createFileRoute('/admin/courses/$courseId_/questions/$questionId')({
	validateSearch: (s: Record<string, unknown>): { type?: string } =>
		typeof s.type === 'string' ? { type: s.type } : {},
	beforeLoad: requirePerm('assessments.bank.read'),
	component: () => {
		const { courseId, questionId } = Route.useParams()
		const { type } = Route.useSearch()
		return <QuestionEditorPage key={questionId} courseId={courseId} questionId={questionId} type={type} />
	},
})
