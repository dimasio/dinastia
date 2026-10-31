// Сервер (apps/api): таблицы типов для drizzle-kit и пары «определение + таблицы» для ядра. Клиент это не импортирует.

import { callout } from './callout/definition.ts'
import { blockCallout } from './callout/table.ts'
import { type BlockStorage, defineBlockStorage } from './storage.ts'

// gen:block:server-import

export * from './tables.ts'

export const blockStorages: Readonly<Record<string, BlockStorage>> = {
	callout: defineBlockStorage(callout, blockCallout),
	// gen:block:storage
}

const probes = new Map<string, BlockStorage>()

/** Только тесты ядра: пробный тип блока (таблицы создаёт тест). Боевые типы — в blockStorages. */
export function registerProbeBlock(storage: BlockStorage) {
	if (storage.def.type in blockStorages) throw new Error(`тип «${storage.def.type}» уже в реестре`)
	probes.set(storage.def.type, storage)
}

export const blockStorage = (type: string): BlockStorage | undefined => blockStorages[type] ?? probes.get(type)
export {
	type BlockChildTable,
	type BlockStorage,
	type BlockTypeTable,
	blockStorageIssues,
	defineBlockStorage,
} from './storage.ts'
