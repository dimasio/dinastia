// Реестр блоков урока (скилл lesson-blocks, D-034): defineBlock — контракт типа блока. Конструктор, плеер и ядро
// (хранение, публикация) знают только этот контракт, а не конкретные блоки.
import { hasPath } from '@dinastia/contracts/common'
import type { z } from 'zod'

export type BlockCategory = 'content' | 'media' | 'interactive' | 'layout'
export const BLOCK_CATEGORIES: readonly BlockCategory[] = ['content', 'media', 'interactive', 'layout']

/**
 * Когда блок выполнен: `none` — не участвует; `view` — при показе; `interaction` — после `evaluate` с `done`;
 * `grade` — по внешнему процессу модуля (тест, задание).
 */
export type BlockCompletion = 'none' | 'view' | 'interaction' | 'grade'

export interface BlockResult {
	score: number
	max: number
	done: boolean
}

export interface BlockDef<
	T extends string = string,
	S extends z.ZodObject = z.ZodObject,
	P = z.output<S>,
	R = unknown,
> {
	/** `snake_case`, неизменяем после релиза: имя таблицы `block_<type>` и значение `lesson_blocks.type`. */
	type: T
	category: BlockCategory
	/** Данные блока в API; поля = колонки таблицы типа (+ `children` — дочерние таблицы). */
	schema: S
	/** Данные нового блока (проходят `schema`). */
	defaults: () => z.output<S>
	/** Пример заполненного блока (проходит `schema`): на нём проверяется, что toPublic убирает секреты. Обязателен при
	 * `secretKeys` — в defaults() секретов обычно нет (пустой список). По умолчанию — defaults(). */
	example?: () => z.output<S>
	completion: BlockCompletion
	/** Поле-массив схемы → часть имени дочерней таблицы (`cards` → `block_<type>_cards`). У элементов — поле `key`. */
	children?: Readonly<Record<string, string>>
	/** Пути к полям-секретам (`cards.*.isCorrect`): ученику — только через `toPublic`. */
	secretKeys?: readonly string[]
	/** Данные для ученика без секретов; без `secretKeys` — как есть. */
	toPublic: (data: z.output<S>) => P
	/** Интерактивный блок: ответ ученика и чистая проверка (только сервер). Хранение ответов — модуль learning. */
	responseSchema?: z.ZodType<R>
	evaluate?: (data: z.output<S>, response: R) => BlockResult
	/** Замечания «не готов к публикации» (2.5): ключ → есть ли замечание у данных. Текст — `blocks:<type>.issues.<ключ>`.
	 * Черновик с замечаниями сохраняется; урок с ними не публикуется (LESSON_HAS_ISSUES). */
	issues?: Readonly<Record<string, (data: z.output<S>) => boolean>>
}

// biome-ignore lint/suspicious/noExplicitAny: у каждого блока своя схема — для реестров
export type AnyBlockDef = BlockDef<string, any, any, any>

export type BlockData<B extends AnyBlockDef> = z.output<B['schema']>
export type BlockPublicData<B extends AnyBlockDef> = ReturnType<B['toPublic']>

export const BLOCK_TYPE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

type Input<T extends string, S extends z.ZodObject, P, R> = Omit<BlockDef<T, S, P, R>, 'toPublic'> & {
	toPublic?: (data: z.output<S>) => P
}

export function defineBlock<const T extends string, S extends z.ZodObject, P = z.output<S>, R = unknown>(
	def: Input<T, S, P, R>,
): BlockDef<T, S, P, R> {
	if (!BLOCK_TYPE.test(def.type) || def.type.length > 40) throw new Error(`блок «${def.type}»: тип — snake_case`)
	if (def.secretKeys?.length && !def.toPublic) throw new Error(`блок «${def.type}»: есть secretKeys — нужен toPublic`)
	if (def.secretKeys?.length && !def.example)
		throw new Error(`блок «${def.type}»: есть secretKeys — нужен example() с заполненными секретами`)
	if (def.category === 'interactive' && def.completion === 'interaction' && !(def.evaluate && def.responseSchema))
		throw new Error(`блок «${def.type}»: completion interaction — нужны responseSchema и evaluate`)
	const parsed = def.schema.safeParse(def.defaults())
	if (!parsed.success) throw new Error(`блок «${def.type}»: defaults() не проходит schema — ${parsed.error.message}`)
	const shape = def.schema.shape as Record<string, unknown>
	for (const field of Object.keys(def.children ?? {}))
		if (!(field in shape)) throw new Error(`блок «${def.type}»: children.${field} — нет поля в schema`)
	const toPublic = def.toPublic ?? ((d: z.output<S>) => d as unknown as P)
	const example = def.schema.safeParse((def.example ?? def.defaults)())
	if (!example.success) throw new Error(`блок «${def.type}»: example() не проходит schema — ${example.error.message}`)
	for (const path of def.secretKeys ?? []) {
		if (!hasPath(example.data, path))
			throw new Error(`блок «${def.type}»: в example() нет секрета ${path} — нечего проверять`)
		if (hasPath(toPublic(example.data), path)) throw new Error(`блок «${def.type}»: toPublic не убирает ${path}`)
	}
	return { ...def, toPublic }
}

/** Ключи замечаний к данным блока (пусто — готов к публикации). */
export function blockDataIssues(def: AnyBlockDef, data: unknown): string[] {
	return Object.entries(def.issues ?? {})
		.filter(([, has]) => has(data))
		.map(([key]) => key)
}
