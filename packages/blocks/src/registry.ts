// Реестр определений блоков (общий для сервера и клиента). Новый тип — `pnpm gen:block <type>` (маркеры gen:block).

import { assignment } from './assignment/definition.ts'
import { callout } from './callout/definition.ts'
import { code } from './code/definition.ts'
import type { AnyBlockDef } from './define.ts'
import { divider } from './divider/definition.ts'
import { embed } from './embed/definition.ts'
import { file } from './file/definition.ts'
import { heading } from './heading/definition.ts'
import { image } from './image/definition.ts'
import { quiz } from './quiz/definition.ts'
import { text } from './text/definition.ts'
import { video } from './video/definition.ts'
// gen:block:import

export const blocks = {
	text,
	heading,
	callout,
	code,
	image,
	video,
	file,
	embed,
	divider,
	quiz: quiz,
	assignment: assignment,
	// gen:block:entry
} satisfies Record<string, AnyBlockDef>

export type BlockType = keyof typeof blocks
export const blockTypes = Object.keys(blocks) as BlockType[]

export const blockDef = (type: string): AnyBlockDef | undefined => (blocks as Record<string, AnyBlockDef>)[type]
