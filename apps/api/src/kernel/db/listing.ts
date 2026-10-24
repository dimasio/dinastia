// Списки (скилл data-access): из входа pageInput (контракт) — условия поиска и фильтров, сортировка, limit/offset.
// Допустимые сортировки и фильтры уже проверил контракт; здесь — их соответствие колонкам.
import type { Page } from '@dinastia/contracts/common'
import { type AnyColumn, and, asc, desc, eq, ilike, or, type SQL } from 'drizzle-orm'

export interface ListInput<S extends string, F extends Record<string, unknown>> {
	page: number
	pageSize: number
	q?: string | undefined
	sort: S
	dir: 'asc' | 'desc'
	filters: Partial<F>
}

export interface ListSpec<S extends string, F extends Record<string, unknown>> {
	/** Колонки, по которым ищет строка поиска (ILIKE, без учёта регистра). */
	search?: AnyColumn[]
	/** Колонка для каждой сортировки контракта; вторым ключом всегда идёт `tiebreak` — порядок стабилен. */
	sort: Record<S, AnyColumn>
	tiebreak: AnyColumn
	/** Колонка для каждого фильтра контракта (равенство). */
	filters?: { [K in keyof F]: AnyColumn }
}

/** Экранирование % и _ в строке поиска — пользовательский ввод не становится шаблоном. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export function listQuery<S extends string, F extends Record<string, unknown>>(
	input: ListInput<S, F>,
	spec: ListSpec<S, F>,
) {
	const conditions: SQL[] = []
	if (input.q && spec.search?.length) {
		const pattern = `%${likeEscape(input.q)}%`
		const any = or(...spec.search.map((c) => ilike(c, pattern)))
		if (any) conditions.push(any)
	}
	for (const [key, value] of Object.entries(input.filters ?? {})) {
		const column = spec.filters?.[key as keyof F]
		if (value !== undefined && column) conditions.push(eq(column, value))
	}
	const by = input.dir === 'desc' ? desc : asc
	return {
		where: conditions.length ? and(...conditions) : undefined,
		orderBy: [by(spec.sort[input.sort]), by(spec.tiebreak)],
		limit: input.pageSize,
		offset: (input.page - 1) * input.pageSize,
	}
}

export function toPage<T>(items: T[], total: number, input: { page: number; pageSize: number }): Page<T> {
	return { items, total, page: input.page, pageSize: input.pageSize }
}
