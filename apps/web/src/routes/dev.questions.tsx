// Песочница вопросов (пункт 1.4): редактор в «банке» (QuestionEditorHost) → попытка по публичным данным
// (toPublic, QuestionViewerHost) → проверка (grade) и разбор (review). Проверка здесь — в браузере ради демо;
// в продукте только сервер (kernel/questions → gradeAnswer). Только в режиме разработки.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Sandbox } from '#/features/dev/questions-sandbox.tsx'

export const Route = createFileRoute('/dev/questions')({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound()
	},
	component: Sandbox,
})
