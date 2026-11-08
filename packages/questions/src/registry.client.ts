// Клиентский реестр типов вопросов: иконка и ленивые редактор/просмотр по типу (только web).
import {
	AlignLeft,
	ArrowDownUp,
	CircleDot,
	Hash,
	Link2,
	ListChecks,
	type LucideIcon,
	Square,
	TextCursorInput,
} from 'lucide-react'
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
	multiple_choice: {
		icon: ListChecks,
		Editor: lazy(() => import('./multiple_choice/editor.tsx')),
		Viewer: lazy(() => import('./multiple_choice/viewer.tsx')),
	},
	text_input: {
		icon: TextCursorInput,
		Editor: lazy(() => import('./text_input/editor.tsx')),
		Viewer: lazy(() => import('./text_input/viewer.tsx')),
	},
	number: {
		icon: Hash,
		Editor: lazy(() => import('./number/editor.tsx')),
		Viewer: lazy(() => import('./number/viewer.tsx')),
	},
	ordering: {
		icon: ArrowDownUp,
		Editor: lazy(() => import('./ordering/editor.tsx')),
		Viewer: lazy(() => import('./ordering/viewer.tsx')),
	},
	matching: {
		icon: Link2,
		Editor: lazy(() => import('./matching/editor.tsx')),
		Viewer: lazy(() => import('./matching/viewer.tsx')),
	},
	open_text: {
		icon: AlignLeft,
		Editor: lazy(() => import('./open_text/editor.tsx')),
		Viewer: lazy(() => import('./open_text/viewer.tsx')),
	},
	// gen:question:client
}

export const clientQuestion = (type: string): ClientQuestion | undefined =>
	(clientQuestions as Record<string, ClientQuestion>)[type]
