// Клиентский реестр типов вопросов: иконка и ленивые редактор/просмотр по типу (только web).
import { CircleDot, type LucideIcon, Square } from 'lucide-react'
import { type ComponentType, type LazyExoticComponent, lazy } from 'react'
import type { QuestionType } from './registry.ts'
import type { QuestionEditorProps, QuestionViewerProps } from './types.ts'

/** Иконка нового типа из генератора — заменить на подходящую из lucide-react. */
export const DEFAULT_QUESTION_ICON: LucideIcon = Square

export interface ClientQuestion {
	icon: LucideIcon
	// biome-ignore lint/suspicious/noExplicitAny: у каждого типа свои данные
	Editor: LazyExoticComponent<ComponentType<QuestionEditorProps<any>>>
	// biome-ignore lint/suspicious/noExplicitAny: то же
	Viewer: LazyExoticComponent<ComponentType<QuestionViewerProps<any>>>
}

export const clientQuestions: Record<QuestionType, ClientQuestion> = {
	single_choice: {
		icon: CircleDot,
		Editor: lazy(() => import('./single_choice/editor.tsx')),
		Viewer: lazy(() => import('./single_choice/viewer.tsx')),
	},
	// gen:question:client
}

export const clientQuestion = (type: string): ClientQuestion | undefined =>
	(clientQuestions as Record<string, ClientQuestion>)[type]
