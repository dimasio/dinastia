// Пропсы редактора и просмотра блока (скилл lesson-blocks): хосты (client/) передают их компонентам типа.
import type { AnyBlockDef, BlockData, BlockPublicData, BlockResult } from './define.ts'

export interface BlockEditorProps<B extends AnyBlockDef> {
	/** Полные данные черновика (с секретами). */
	value: BlockData<B>
	/** Новое значение; хост проверяет схемой и сохраняет. */
	onChange: (next: BlockData<B>) => void
	readOnly?: boolean
	/** Префикс data-testid для полей редактора. */
	testId: string
}

export interface BlockViewerProps<B extends AnyBlockDef> {
	/** Публичные данные (`toPublic` опубликованной версии) — секретов здесь нет. */
	data: BlockPublicData<B>
	/** Результат ученика (интерактивные блоки; модуль learning). */
	state?: { result?: BlockResult | null }
	/** Ответ ученика → сервер (evaluate) → новый state. */
	onInteract?: (response: unknown) => Promise<void>
	testId: string
}
