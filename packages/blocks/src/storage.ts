// Хранение блока (только сервер, скилл lesson-blocks): определение типа + его таблицы. Ядро (apps/api/src/kernel/blocks)
// по этой паре делает load/save/copy: поле схемы = колонка таблицы типа, поле из `children` = дочерняя таблица.
import { getTableColumns, getTableName } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { z } from 'zod'
import type { AnyBlockDef } from './define.ts'

export type BlockTypeTable = PgTable & { blockId: AnyPgColumn; schoolId: AnyPgColumn }
export type BlockChildTable = PgTable & {
	id: AnyPgColumn
	blockId: AnyPgColumn
	schoolId: AnyPgColumn
	position: AnyPgColumn
	itemKey: AnyPgColumn
}

export interface BlockStorage {
	def: AnyBlockDef
	table: BlockTypeTable
	/** Поле схемы → дочерняя таблица (как `def.children`). */
	children: Readonly<Record<string, BlockChildTable>>
}

/** Служебные колонки — не данные блока. */
export const BLOCK_SERVICE_COLUMNS = ['blockId', 'schoolId'] as const
export const CHILD_SERVICE_COLUMNS = ['id', 'schoolId', 'blockId', 'position', 'itemKey'] as const

export function defineBlockStorage(
	def: AnyBlockDef,
	table: BlockTypeTable,
	children: Readonly<Record<string, BlockChildTable>> = {},
): BlockStorage {
	const storage = { def, table, children }
	const issues = blockStorageIssues(storage)
	if (issues.length) throw new Error(`блок «${def.type}»: ${issues.join('; ')}`)
	return storage
}

interface Def {
	type: string
	innerType?: z.ZodType
	element?: z.ZodType
	shape?: Record<string, z.ZodType>
}
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def
function unwrap(s: z.ZodType): z.ZodType {
	let cur = s
	for (let d = defOf(cur); ['optional', 'nullable', 'default'].includes(d.type); d = defOf(cur))
		cur = d.innerType as z.ZodType
	return cur
}

const diff = (want: string[], have: string[]) => ({
	missing: want.filter((k) => !have.includes(k)),
	extra: have.filter((k) => !want.includes(k)),
})

/** Расхождения схемы блока и его таблиц: имена полей схемы = свойства колонок (основа check:registries, пункт 1.5). */
export function blockStorageIssues({ def, table, children }: BlockStorage): string[] {
	const issues: string[] = []
	const expectedName = `block_${def.type}`
	if (getTableName(table) !== expectedName) issues.push(`таблица ${getTableName(table)}, ожидалась ${expectedName}`)
	const shape = def.schema.shape as Record<string, z.ZodType>
	const childFields = Object.keys(def.children ?? {})
	const tableChildren = Object.keys(children)
	const ch = diff(childFields, tableChildren)
	if (ch.missing.length || ch.extra.length)
		issues.push(`children определения [${childFields}] ≠ дочерние таблицы [${tableChildren}]`)

	const columns = Object.keys(getTableColumns(table)).filter(
		(k) => !(BLOCK_SERVICE_COLUMNS as readonly string[]).includes(k),
	)
	const fields = Object.keys(shape).filter((k) => !childFields.includes(k))
	const main = diff(fields, columns)
	if (main.missing.length) issues.push(`нет колонок для полей схемы: ${main.missing.join(', ')}`)
	if (main.extra.length) issues.push(`колонки без поля в схеме: ${main.extra.join(', ')}`)

	for (const field of childFields) {
		const child = children[field]
		if (!child) continue
		const part = def.children?.[field]
		if (getTableName(child) !== `${expectedName}_${part}`)
			issues.push(`дочерняя таблица ${getTableName(child)}, ожидалась ${expectedName}_${part}`)
		const arr = defOf(unwrap(shape[field] as z.ZodType))
		const element = arr.type === 'array' ? defOf(unwrap(arr.element as z.ZodType)) : undefined
		if (element?.type !== 'object' || !element.shape) {
			issues.push(`${field}: в схеме должен быть массив объектов`)
			continue
		}
		const itemFields = Object.keys(element.shape).filter((k) => k !== 'key')
		const itemColumns = Object.keys(getTableColumns(child)).filter(
			(k) => !(CHILD_SERVICE_COLUMNS as readonly string[]).includes(k),
		)
		const d = diff(itemFields, itemColumns)
		if (d.missing.length) issues.push(`${field}: нет колонок для полей ${d.missing.join(', ')}`)
		if (d.extra.length) issues.push(`${field}: колонки без поля в схеме: ${d.extra.join(', ')}`)
	}
	return issues
}
