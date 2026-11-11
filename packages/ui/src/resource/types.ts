// Типы ресурс-фреймворка (скилл admin-resource): описание CRUD-экрана сущности. Только существующие опции —
// не хватает опции, нужен запрос к ядру (docs/tasks/requests/).
import type { ReactNode } from 'react'
import type { z } from 'zod'

/** Вход списка — как `pageInput()` контракта. */
export interface ListParams {
	page?: number | undefined
	pageSize?: number | undefined
	q?: string | undefined
	sort?: string | undefined
	dir?: 'asc' | 'desc' | undefined
	filters?: Record<string, unknown> | undefined
}

/** Выход списка — как `page()` контракта. */
export interface ListPage<Row> {
	items: Row[]
	total: number
	page: number
	pageSize: number
}

export type SortOf<I> = I extends { sort?: infer S } ? Extract<S, string> : never
export type FilterOf<I> = I extends { filters?: infer F } ? keyof NonNullable<F> & string : never

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline'

/** Кто смотрит экран: права и участник (скрыть недоступное; запрещает всё равно сервер). */
export interface Viewer {
	memberId: string
	role: string
	permissions: readonly string[]
}

export interface ColumnDef<Row, S extends string> {
	field: keyof Row & string
	/** Ключ сортировки контракта (`sorts` в `pageInput`); без него колонка не сортируется. */
	sort?: S
	/** `text` по умолчанию; функция — свой рендер ячейки. */
	render?: 'text' | 'badge' | 'date' | 'datetime' | 'number' | 'bool' | ((row: Row) => ReactNode)
	/** Префикс ключей подписей значений (`common:roles`); по умолчанию `<ns>:<key>.values.<field>`. */
	labels?: string
	/** Поле строки со ссылкой на фото: в ячейке — аватар (фото или инициалы по значению колонки) и текст. */
	avatar?: keyof Row & string
	/** Вид бейджа по значению (для `render: 'badge'`). */
	tone?: (value: unknown) => BadgeTone
}

/**
 * Вариант выбора: строка — значение, подпись из i18n (`labels` или `<ns>:<key>.values.<field>.<значение>`); объект — значение
 * и готовая подпись из данных (поток, курс, тег — то, что известно только во время работы).
 */
export type OptionDef = string | { value: string; label: string }

export const optionValue = (o: OptionDef) => (typeof o === 'string' ? o : o.value)

export interface FilterDef<F extends string> {
	field: F
	/** Допустимые значения (тот же список, что в enum контракта) или значения с подписями из данных. */
	options: readonly OptionDef[]
	labels?: string
}

export type Widget = 'input' | 'email' | 'textarea' | 'select' | 'switch' | 'number' | 'richtext'

export interface FieldOverride<V> {
	/** По умолчанию — по типу zod: string→input, email→email, enum→select, boolean→switch, number→number,
	 * RichText/CompactText/CommentText (@dinastia/contracts/common)→richtext с профилем схемы. */
	widget?: Widget
	/** Значения для select, если поле не enum; объект — значение с подписью из данных. */
	options?: readonly OptionDef[]
	labels?: string
	/** Подсказка под полем — строка `<ns>:<key>.hints.<field>`. */
	hint?: boolean
	/** Показывать поле, только если условие верно (скрытое поле не отправляется). */
	visibleIf?: (values: Partial<V>) => boolean
}

export interface FormDef<S extends z.ZodObject> {
	schema: S
	fields?: { [K in keyof z.input<S> & string]?: FieldOverride<z.input<S>> }
	/** Порядок и строки полей: `[['firstName', 'lastName'], ['email']]`; по умолчанию — по одному в строке. */
	layout?: (keyof z.input<S> & string)[][]
}

export interface CreateDef<S extends z.ZodObject> extends FormDef<S> {
	perm?: string
	initial?: Partial<z.input<S>>
	submit: (values: z.output<S>) => Promise<unknown>
	mode?: 'sheet' | 'dialog'
}

/**
 * Действие над строкой. Строки — `<ns>:<key>.actions.<key>.{label,title,description,submit,success}`.
 * С `form` — диалог с формой, с `confirm` — подтверждение; после успеха список перезагружается.
 */
export interface ActionDef<Row, S extends z.ZodObject = z.ZodObject> {
	key: string
	perm?: string
	visible?: (row: Row, viewer: Viewer) => boolean
	variant?: 'default' | 'destructive'
	confirm?: boolean
	form?: FormDef<S> & { initial?: (row: Row) => Partial<z.input<S>> }
	run: (row: Row, values: z.output<S>) => Promise<unknown>
}

/**
 * Действие страницы — кнопка в шапке над списком с текущими поиском и фильтрами (выгрузка в Excel). Подпись —
 * `<ns>:<key>.pageActions.<key>`; пока действие выполняется, кнопка недоступна; ошибка — сообщением.
 */
export interface PageActionDef<I> {
	key: string
	perm?: string
	icon?: ReactNode
	run: (input: I) => Promise<unknown>
}

export interface ResourceDef<Row extends { id: string }, I extends ListParams = ListParams> {
	/** Имя ресурса: ключ кэша списка, `data-testid`, раздел строк `<ns>:<key>.*`. */
	key: string
	/** Namespace строк (модуль). */
	ns: string
	/**
	 * Область кэша списка, если ресурс строится на запись (курс): списки разных курсов не смешиваются. Не удаляй кэш в
	 * `beforeLoad` маршрута — предзагрузка по наведению удалит запрос, который экран уже ждёт.
	 */
	scope?: string
	row: z.ZodType<Row>
	list: (input: I) => Promise<ListPage<Row>>
	perms: { read: string; write?: string }
	columns: ColumnDef<Row, SortOf<I>>[]
	/** Строка поиска → `input.q`. */
	search?: boolean
	filters?: FilterDef<FilterOf<I>>[]
	pageSize?: number
	// biome-ignore lint/suspicious/noExplicitAny: схема формы создания — своя у каждого ресурса
	create?: CreateDef<any>
	// biome-ignore lint/suspicious/noExplicitAny: у каждого действия своя схема формы (типизирует action())
	actions?: ActionDef<Row, any>[]
	/** Действия над списком целиком (право — `perm`, иначе `perms.read`). */
	pageActions?: PageActionDef<I>[]
}

/** Состояние списка в адресе страницы (`validateSearch: resourceSearch`). */
export interface ResourceSearch {
	page?: number | undefined
	q?: string | undefined
	sort?: string | undefined
	dir?: 'asc' | 'desc' | undefined
	filters?: Record<string, string> | undefined
}
