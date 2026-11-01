// Клиентский реестр блоков: иконка палитры и ленивые редактор/просмотр по типу (только web; api это не импортирует).
import {
	AppWindow,
	Code,
	Heading,
	type LucideIcon,
	MessageSquareWarning,
	Minus,
	Square,
	Type,
	Video,
} from 'lucide-react'
import { type ComponentType, type LazyExoticComponent, lazy } from 'react'
import type { BlockType } from './registry.ts'
import type { BlockEditorProps, BlockViewerProps } from './types.ts'

/** Иконка нового блока из генератора — заменить на подходящую из lucide-react. */
export const DEFAULT_BLOCK_ICON: LucideIcon = Square

export interface ClientBlock {
	icon: LucideIcon
	// biome-ignore lint/suspicious/noExplicitAny: у каждого блока свои данные
	Editor: LazyExoticComponent<ComponentType<BlockEditorProps<any>>>
	// biome-ignore lint/suspicious/noExplicitAny: то же
	Viewer: LazyExoticComponent<ComponentType<BlockViewerProps<any>>>
}

export const clientBlocks: Record<BlockType, ClientBlock> = {
	callout: {
		icon: MessageSquareWarning,
		Editor: lazy(() => import('./callout/editor.tsx')),
		Viewer: lazy(() => import('./callout/viewer.tsx')),
	},
	text: {
		icon: Type,
		Editor: lazy(() => import('./text/editor.tsx')),
		Viewer: lazy(() => import('./text/viewer.tsx')),
	},
	heading: {
		icon: Heading,
		Editor: lazy(() => import('./heading/editor.tsx')),
		Viewer: lazy(() => import('./heading/viewer.tsx')),
	},
	code: {
		icon: Code,
		Editor: lazy(() => import('./code/editor.tsx')),
		Viewer: lazy(() => import('./code/viewer.tsx')),
	},
	divider: {
		icon: Minus,
		Editor: lazy(() => import('./divider/editor.tsx')),
		Viewer: lazy(() => import('./divider/viewer.tsx')),
	},
	video: {
		icon: Video,
		Editor: lazy(() => import('./video/editor.tsx')),
		Viewer: lazy(() => import('./video/viewer.tsx')),
	},
	embed: {
		icon: AppWindow,
		Editor: lazy(() => import('./embed/editor.tsx')),
		Viewer: lazy(() => import('./embed/viewer.tsx')),
	},
	// gen:block:client
}

export const clientBlock = (type: string): ClientBlock | undefined =>
	(clientBlocks as Record<string, ClientBlock>)[type]
