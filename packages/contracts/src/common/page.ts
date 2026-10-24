// Пагинация списков (скилл admin-resource): допустимые сортировки и фильтры — часть схемы входа, чужое отсекается
// контрактом (400), а не сервисом.
import { z } from 'zod'

export const PAGE_SIZE_MAX = 100

/** Вход списка: страница, размер, поиск, сортировка из `sorts`, фильтры по схеме `filters`. */
export function pageInput<S extends readonly [string, ...string[]], F extends z.ZodRawShape>(spec: {
	sorts: S
	defaultSort: S[number]
	defaultDir?: 'asc' | 'desc'
	filters?: F
}) {
	return z.object({
		page: z.number().int().min(1).default(1),
		pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
		q: z.string().trim().max(200).optional(),
		sort: z.enum(spec.sorts).default(spec.defaultSort as never),
		dir: z.enum(['asc', 'desc']).default(spec.defaultDir ?? 'asc'),
		filters: z
			.object(spec.filters ?? ({} as F))
			.partial()
			.default({} as never),
	})
}

/** Выход списка. */
export function page<T extends z.ZodType>(item: T) {
	return z.object({
		items: z.array(item),
		total: z.number().int(),
		page: z.number().int(),
		pageSize: z.number().int(),
	})
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }
