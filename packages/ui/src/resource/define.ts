// Описание ресурса и состояние списка (скилл admin-resource).
import type { z } from 'zod'
import {
	type ActionDef,
	type ListPage,
	type ListParams,
	type OptionDef,
	optionValue,
	type ResourceDef,
	type ResourceSearch,
} from './types.ts'

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

/**
 * Параметры адреса для маршрута ресурса; лишнее и битое отбрасывается, а не ломает экран. Функция, а не схема zod: маршруты
 * разбирают адрес при старте приложения, и zod не должен попадать в начальную загрузку (5.2).
 */
export function resourceSearch(raw: Record<string, unknown>): ResourceSearch {
	const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)
	const page = typeof raw.page === 'number' ? raw.page : Number(str(raw.page, 10))
	const filters =
		raw.filters && typeof raw.filters === 'object' && !Array.isArray(raw.filters)
			? Object.fromEntries(
					Object.entries(raw.filters as Record<string, unknown>).filter(
						(e): e is [string, string] => e[0].length <= 50 && typeof e[1] === 'string' && e[1].length <= 200,
					),
				)
			: undefined
	return {
		page: Number.isInteger(page) && page >= 1 ? page : undefined,
		q: str(raw.q, 200),
		sort: str(raw.sort, 50),
		dir: raw.dir === 'asc' || raw.dir === 'desc' ? raw.dir : undefined,
		filters,
	}
}

/** Адрес → вход списка: только сортировки колонок и значения фильтров ресурса (чужое — не уходит на сервер). */
export function toListInput(
	def: {
		columns: { sort?: string }[]
		filters?: { field: string; options: readonly OptionDef[] }[]
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
		if (value && f.options.some((o) => optionValue(o) === value)) filters[f.field] = value
	}
	if (Object.keys(filters).length) input.filters = filters
	return input
}
