// Таблица ресурса (скилл admin-resource): данные и порядок — с сервера (manualSorting), таблица только показывает.
import {
	type CellContext,
	rowSortingFeature,
	type SortingState,
	type ColumnDef as TableColumnDef,
	tableFeatures,
	useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { UserAvatar } from '#/components/user-avatar.tsx'
import { cn } from '#/lib/utils.ts'
import { useResourceT } from './context.tsx'
import type { ActionDef, ColumnDef, ResourceDef } from './types.ts'

const features = tableFeatures({ rowSortingFeature })

/** Узкий экран (< 640px, как `sm` Tailwind): строки — карточками, а не таблицей (карточка 2.1). */
const NARROW = '(max-width: 639px)'
function useNarrow(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const mq = window.matchMedia(NARROW)
			mq.addEventListener('change', onChange)
			return () => mq.removeEventListener('change', onChange)
		},
		() => window.matchMedia(NARROW).matches,
		() => false,
	)
}

export interface ResourceTableProps<Row extends { id: string }> {
	resource: ResourceDef<Row, never>
	rows: Row[]
	sort?: { by: string; dir: 'asc' | 'desc' } | undefined
	onSort: (sort: { by: string; dir: 'asc' | 'desc' } | undefined) => void
	/** Действия, доступные зрителю для строки (права и `visible` уже применены). */
	actionsFor: (row: Row) => ActionDef<Row>[]
	onAction: (action: ActionDef<Row>, row: Row) => void
	pending?: boolean
}

export function ResourceTable<Row extends { id: string }>({
	resource,
	rows,
	sort,
	onSort,
	actionsFor,
	onAction,
	pending,
}: ResourceTableProps<Row>) {
	const { t, r, value, lang } = useResourceT(resource.ns, resource.key)
	const hasActions = (resource.actions?.length ?? 0) > 0

	const columns = useMemo(() => {
		const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
		const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
		const number = new Intl.NumberFormat(lang)
		const cell = (c: ColumnDef<Row, string>) => (ctx: CellContext<typeof features, Row, unknown>) => {
			const row = ctx.row.original
			const v = row[c.field] as unknown
			if (typeof c.render === 'function') return c.render(row)
			if (c.avatar)
				return (
					<span className="flex items-center gap-2">
						<UserAvatar name={String(v ?? '')} src={row[c.avatar] as string | null} size="sm" />
						{String(v ?? '')}
					</span>
				)
			if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>
			switch (c.render) {
				case 'badge':
					return <Badge variant={c.tone?.(v) ?? 'secondary'}>{value(c.field, v, c.labels)}</Badge>
				case 'date':
					return date.format(new Date(v as string))
				case 'datetime':
					return dateTime.format(new Date(v as string))
				case 'number':
					return number.format(v as number)
				case 'bool':
					return value(c.field, String(v), c.labels ?? 'common:resource.bool')
				default:
					return String(v)
			}
		}
		return resource.columns.map(
			(c): TableColumnDef<typeof features, Row, unknown> => ({
				id: c.sort ?? c.field,
				meta: c.field,
				accessorFn: (row) => row[c.field],
				header: r(`fields.${c.field}`),
				enableSorting: Boolean(c.sort),
				cell: cell(c as ColumnDef<Row, string>),
			}),
		)
	}, [resource.columns, r, value, lang])

	const narrow = useNarrow()
	const actionsMenu = (row: Row) => {
		const actions = hasActions ? actionsFor(row) : []
		if (!actions.length) return null
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t('common:resource.rowActions')}
						data-testid={`resource-${resource.key}-row-actions`}
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{actions.map((a) => (
						<DropdownMenuItem
							key={a.key}
							variant={a.variant === 'destructive' ? 'destructive' : 'default'}
							onSelect={() => onAction(a, row)}
							data-testid={`resource-${resource.key}-action-${a.key}`}
						>
							{r(`actions.${a.key}.label`)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		)
	}

	const sorting: SortingState = sort ? [{ id: sort.by, desc: sort.dir === 'desc' }] : []
	const table = useTable({
		features,
		columns,
		data: rows,
		getRowId: (row) => row.id,
		manualSorting: true,
		enableMultiSort: false,
		state: { sorting },
		onSortingChange: (updater) => {
			const next = typeof updater === 'function' ? updater(sorting) : updater
			const first = next[0]
			onSort(first ? { by: first.id, dir: first.desc ? 'desc' : 'asc' } : undefined)
		},
	})

	if (narrow)
		return (
			<ul
				className={cn('grid gap-2', pending && 'opacity-60 transition-opacity')}
				data-testid={`resource-${resource.key}-cards`}
			>
				{table.getRowModel().rows.map((row) => {
					const [first, ...rest] = row.getAllCells()
					return (
						<li key={row.id} className="rounded-lg border p-3" data-testid={`resource-${resource.key}-row`}>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0 font-medium">{first ? <table.FlexRender cell={first} /> : null}</div>
								{actionsMenu(row.original)}
							</div>
							<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
								{rest.map((cell) => (
									<div key={cell.id} className="contents">
										<dt className="text-muted-foreground">
											{r(`fields.${String(cell.column.columnDef.meta ?? cell.column.id)}`)}
										</dt>
										<dd className="min-w-0 break-words">
											<table.FlexRender cell={cell} />
										</dd>
									</div>
								))}
							</dl>
						</li>
					)
				})}
			</ul>
		)

	return (
		<div className={cn('rounded-lg border', pending && 'opacity-60 transition-opacity')}>
			<Table data-testid={`resource-${resource.key}-table`}>
				<TableHeader>
					{table.getHeaderGroups().map((group) => (
						<TableRow key={group.id}>
							{group.headers.map((header) => {
								const dir = header.column.getIsSorted()
								return (
									<TableHead
										key={header.id}
										aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
									>
										{header.column.getCanSort() ? (
											<Button
												variant="ghost"
												size="sm"
												className="-ml-3"
												onClick={header.column.getToggleSortingHandler()}
												data-testid={`resource-${resource.key}-sort-${header.column.id}`}
											>
												<table.FlexRender header={header} />
												{dir === 'asc' ? (
													<ArrowUp aria-hidden />
												) : dir === 'desc' ? (
													<ArrowDown aria-hidden />
												) : (
													<ArrowUpDown aria-hidden className="opacity-40" />
												)}
											</Button>
										) : (
											<table.FlexRender header={header} />
										)}
									</TableHead>
								)
							})}
							{hasActions ? <TableHead className="w-12" /> : null}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => {
						return (
							<TableRow key={row.id} data-testid={`resource-${resource.key}-row`}>
								{row.getAllCells().map((cell) => (
									<TableCell key={cell.id}>
										<table.FlexRender cell={cell} />
									</TableCell>
								))}
								{hasActions ? <TableCell className="text-right">{actionsMenu(row.original)}</TableCell> : null}
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
