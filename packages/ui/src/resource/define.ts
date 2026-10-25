// Описание ресурса и состояние списка (скилл admin-resource).
import { z } from 'zod'
import type { ActionDef, ListPage, ListParams, ResourceDef, ResourceSearch } from './types.ts'

// biome-ignore lint/suspicious/noExplicitAny: любая процедура списка (клиент oRPC — функция с необязательными опциями)
type ListFn<Row> = (input: any, ...rest: any[]) => Promise<ListPage<Row>>
type InputOf<L> = L extends (input: infer I, ...rest: never[]) => unknown ? Extract<NonNullable<I>, ListParams> : never

/**
 * Ресурс: тип строки — из `row`, сортировки и фильтры — из входа `list` (процедура контракта,
 * `list: client.<модуль>.list`).
 */
export function defineResource<Row extends { id: string }, L extends ListFn<Row>>(
	def: Omit<ResourceDef<Row, InputOf<L>>, 'list'> & { list: L },
): ResourceDef<Row, InputOf<L>> {
	return def
}

/** Действие строки с типизированной формой: значения `run` — из `form.schema`. */
export function action<Row, S extends z.ZodObject = z.ZodObject>(def: ActionDef<Row, S>) {
	return def
}

/** Схема параметров адреса для маршрута ресурса; лишнее и битое отбрасывается, а не ломает экран. */
export const resourceSearch = z.object({
	page: z.coerce.number().int().min(1).optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
	sort: z.string().max(50).optional().catch(undefined),
	dir: z.enum(['asc', 'desc']).optional().catch(undefined),
	filters: z.record(z.string(), z.string()).optional().catch(undefined),
}) satisfies z.ZodType<ResourceSearch>

/** Адрес → вход списка: только сортировки колонок и значения фильтров ресурса (чужое — не уходит на сервер). */
export function toListInput(
	def: {
		columns: { sort?: string }[]
		filters?: { field: string; options: readonly string[] }[]
		pageSize?: number
		search?: boolean
	},
	search: ResourceSearch,
): ListParams {
	const input: ListParams = { page: search.page ?? 1, pageSize: def.pageSize ?? 20 }
	const q = search.q?.trim()
	if (def.search && q) input.q = q
	const sorts = def.columns.flatMap((c) => (c.sort ? [c.sort] : []))
	if (search.sort && sorts.includes(search.sort)) {
		input.sort = search.sort
		input.dir = search.dir ?? 'asc'
	}
	const filters: Record<string, string> = {}
	for (const f of def.filters ?? []) {
		const value = search.filters?.[f.field]
		if (value && f.options.includes(value)) filters[f.field] = value
	}
	if (Object.keys(filters).length) input.filters = filters
	return input
}
