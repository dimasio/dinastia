// Реестр определений блоков (общий для сервера и клиента). Новый тип — `pnpm gen:block <type>` (маркеры gen:block).
import { callout } from './callout/definition.ts'
import type { AnyBlockDef } from './define.ts'
// gen:block:import

export const blocks = {
	callout,
	// gen:block:entry
} satisfies Record<string, AnyBlockDef>

export type BlockType = keyof typeof blocks
export const blockTypes = Object.keys(blocks) as BlockType[]

export const blockDef = (type: string): AnyBlockDef | undefined => (blocks as Record<string, AnyBlockDef>)[type]
