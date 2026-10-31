// Клиентский реестр блоков: иконка палитры и ленивые редактор/просмотр по типу (только web; api это не импортирует).
import { type LucideIcon, MessageSquareWarning, Square } from 'lucide-react'
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
	// gen:block:client
}

export const clientBlock = (type: string): ClientBlock | undefined =>
	(clientBlocks as Record<string, ClientBlock>)[type]
