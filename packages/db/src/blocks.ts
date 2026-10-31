// Блоки уроков (D-033, D-034, скилл lesson-blocks): общая строка блока `lesson_blocks` и хелперы таблиц типов.
// Таблица ядра: на неё ссылаются таблицы типов, публикацией управляет ядро (kernel/blocks). Урок — модуль courses
// (фаза 2): внешний ключ lesson_id → lessons добавит его миграция (D-051).
import { getTableName, sql } from 'drizzle-orm'
import {
	type AnyPgColumn,
	boolean,
	foreignKey,
	index,
	integer,
	type PgColumnBuilderBase,
	type PgTable,
	type PgTableExtraConfigValue,
	pgEnum,
	pgTable,
	text,
	unique,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core'
import { schoolIdColumn, tenantIsolation, tenantTable } from './tenant.ts'

export const blockState = pgEnum('block_state', ['draft', 'published'])

/**
 * Блок урока: одна строка на версию (черновик или публикация). `block_key` одинаков у черновика и его публикации —
 * на него ссылаются ответы и прогресс учеников, поэтому повторная публикация их не теряет.
 */
export const lessonBlocks = tenantTable(
	'lesson_blocks',
	{
		lessonId: uuid('lesson_id').notNull(),
		blockKey: uuid('block_key').notNull().default(sql`uuidv7()`),
		state: blockState('state').notNull().default('draft'),
		/** Тип из реестра блоков (`defineBlock`); после релиза не меняется. */
		type: text('type').notNull(),
		position: integer('position').notNull(),
		isRequired: boolean('is_required').notNull().default(false),
	},
	(t) => [
		uniqueIndex().on(t.schoolId, t.lessonId, t.state, t.blockKey),
		index().on(t.schoolId, t.lessonId, t.state, t.position),
	],
)

type BlockColumns = {
	blockId: ReturnType<typeof blockIdColumn>
	schoolId: ReturnType<typeof schoolIdColumn>
}
const blockIdColumn = () => uuid('block_id').primaryKey()

/**
 * Таблица типа блока `block_<type>` (D-034): данные блока — колонки, PK = `block_id` строки `lesson_blocks`
 * (удаление строки удаляет данные), `school_id` и RLS — как у тенантной таблицы.
 */
export function blockTable<TType extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
	type: TType,
	columns: TColumns,
	extraConfig?: (
		t: ReturnType<typeof pgTable<`block_${TType}`, TColumns & BlockColumns>>['_']['columns'],
	) => PgTableExtraConfigValue[],
) {
	const name = `block_${type}` as const
	return pgTable(
		name,
		{ blockId: blockIdColumn(), schoolId: schoolIdColumn(), ...columns } as TColumns & BlockColumns,
		(t) => [
			foreignKey({
				columns: [t.schoolId, t.blockId],
				foreignColumns: [lessonBlocks.schoolId, lessonBlocks.id],
			}).onDelete('cascade'),
			// цель составных ключей дочерних таблиц типа
			unique(`${name}_school_id_block_id_key`).on(t.schoolId, t.blockId),
			tenantIsolation(name, t.schoolId),
			...(extraConfig?.(t as never) ?? []),
		],
	).enableRLS()
}

type ChildColumns = {
	id: ReturnType<typeof childIdColumn>
	schoolId: ReturnType<typeof schoolIdColumn>
	blockId: ReturnType<typeof childBlockIdColumn>
	position: ReturnType<typeof positionColumn>
	itemKey: ReturnType<typeof itemKeyColumn>
}
const childIdColumn = () => uuid('id').primaryKey().default(sql`uuidv7()`)
const childBlockIdColumn = () => uuid('block_id').notNull()
const positionColumn = () => integer('position').notNull()
/** Стабилен между черновиком и публикацией (как block_key): на элемент списка ссылаются ответы учеников. */
const itemKeyColumn = () => uuid('item_key').notNull().default(sql`uuidv7()`)

/**
 * Дочерняя таблица типа `block_<type>_<part>` — список внутри блока (карточки, варианты): строки по `position`,
 * удаляются вместе с блоком; `item_key` — стабильный ключ элемента между версиями (в API — поле `key`).
 */
export function blockChildTable<TPart extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
	parent: PgTable & { schoolId: AnyPgColumn; blockId: AnyPgColumn },
	part: TPart,
	columns: TColumns,
) {
	const name = `${getTableName(parent)}_${part}`
	return pgTable(
		name,
		{
			id: childIdColumn(),
			schoolId: schoolIdColumn(),
			blockId: childBlockIdColumn(),
			position: positionColumn(),
			itemKey: itemKeyColumn(),
			...columns,
		} as TColumns & ChildColumns,
		(t) => [
			foreignKey({ columns: [t.schoolId, t.blockId], foreignColumns: [parent.schoolId, parent.blockId] }).onDelete(
				'cascade',
			),
			index().on(t.schoolId, t.blockId, t.position),
			tenantIsolation(name, t.schoolId),
		],
	).enableRLS()
}
