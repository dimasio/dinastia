// Экран ресурса (скилл admin-resource): заголовок, поиск и фильтры, таблица, страницы, форма создания, действия.
// Состояние списка — в адресе (search маршрута), данные — TanStack Query, после изменений список перезагружается.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { EmptyState } from '#/components/empty-state.tsx'
import { PageHeader } from '#/components/page-header.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '#/components/ui/alert-dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select.tsx'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { can, useResourceEnv, useResourceT } from './context.tsx'
import { toListInput } from './define.ts'
import { ResourceForm } from './resource-form.tsx'
import { ResourceTable } from './resource-table.tsx'
import { type ActionDef, type FormDef, optionValue, type ResourceDef, type ResourceSearch } from './types.ts'

const ALL = '__all'

/** Ключ кэша списков ресурса — для инвалидации снаружи: `queryClient.invalidateQueries({ queryKey: resourceKey('staff') })`. */
export const resourceKey = (key: string) => ['resource', key] as const

export interface ResourcePageProps<Row extends { id: string }> {
	// biome-ignore lint/suspicious/noExplicitAny: вход списка конкретного ресурса не важен странице
	resource: ResourceDef<Row, any>
	search: ResourceSearch
	onSearch: (next: ResourceSearch) => void
}

export function ResourcePage<Row extends { id: string }>({ resource, search, onSearch }: ResourcePageProps<Row>) {
	const { viewer, errorText } = useResourceEnv()
	const { t, r, value } = useResourceT(resource.ns, resource.key)
	const queryClient = useQueryClient()
	const input = toListInput(resource, search)
	const list = useQuery({
		queryKey: [...resourceKey(resource.key), input],
		queryFn: () => resource.list(input),
		placeholderData: keepPreviousData,
	})
	const refresh = () => queryClient.invalidateQueries({ queryKey: resourceKey(resource.key) })

	const [q, setQ] = useState(search.q ?? '')
	useEffect(() => {
		const next = q.trim() || undefined
		if (next === (search.q || undefined)) return
		const timer = setTimeout(() => onSearch({ ...search, q: next, page: undefined }), 300)
		return () => clearTimeout(timer)
	}, [q, search, onSearch])

	const [creating, setCreating] = useState(false)
	const [active, setActive] = useState<{ action: ActionDef<Row>; row: Row }>()
	const filtered = Boolean(input.q || input.filters)
	const canCreate = resource.create && can(viewer, resource.create.perm ?? resource.perms.write)

	const actionsFor = (row: Row) =>
		(resource.actions ?? []).filter(
			(a) => can(viewer, a.perm ?? resource.perms.write) && (a.visible?.(row, viewer) ?? true),
		)

	async function run(action: ActionDef<Row>, row: Row, values: Record<string, unknown> = {}) {
		await action.run(row, values as z.output<z.ZodObject>)
		toast.success(r(`actions.${action.key}.success`, { ...row }))
		setActive(undefined)
		await refresh()
	}

	function onAction(action: ActionDef<Row>, row: Row) {
		if (action.form || action.confirm) return setActive({ action, row })
		run(action, row).catch((err) => toast.error(errorText(err)))
	}

	const page = list.data
	const from = page?.total ? (page.page - 1) * page.pageSize + 1 : 0
	const to = page ? Math.min(page.page * page.pageSize, page.total) : 0
	// в шапке и в пустом состоянии — разные testid: в пустом списке видны обе кнопки
	const createButton = (place: 'header' | 'empty') =>
		canCreate ? (
			<Button
				onClick={() => setCreating(true)}
				data-testid={`resource-${resource.key}-create${place === 'empty' ? '-empty' : ''}`}
			>
				<Plus />
				{r('create.button')}
			</Button>
		) : null

	const createForm = resource.create ? (
		<ResourceForm
			ns={resource.ns}
			resourceKey={resource.key}
			form={resource.create as FormDef<z.ZodObject>}
			defaultValues={resource.create.initial}
			submitLabel={r('create.submit')}
			onCancel={() => setCreating(false)}
			testId={`resource-${resource.key}-create-form`}
			onSubmit={async (values) => {
				await resource.create?.submit(values)
				toast.success(r('create.success', values))
				setCreating(false)
				await refresh()
			}}
		/>
	) : null

	return (
		<div data-testid={`resource-${resource.key}`}>
			<PageHeader title={r('title')} description={r('description')} actions={createButton('header')} />

			{resource.search || resource.filters?.length ? (
				<div className="mb-4 flex flex-wrap gap-2">
					{resource.search ? (
						<Input
							type="search"
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder={r('search', { defaultValue: t('common:resource.search') })}
							aria-label={t('common:resource.search')}
							className="w-full sm:max-w-xs"
							data-testid={`resource-${resource.key}-search`}
						/>
					) : null}
					{resource.filters?.map((f) => (
						<Select
							key={f.field}
							value={search.filters?.[f.field] ?? ALL}
							onValueChange={(v) => {
								const filters = { ...search.filters }
								if (v === ALL) delete filters[f.field]
								else filters[f.field] = v
								onSearch({ ...search, filters: Object.keys(filters).length ? filters : undefined, page: undefined })
							}}
						>
							<SelectTrigger
								className="w-full sm:w-44"
								aria-label={r(`fields.${f.field}`)}
								data-testid={`resource-${resource.key}-filter-${f.field}`}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL}>{t('common:resource.filterAll', { field: r(`fields.${f.field}`) })}</SelectItem>
								{f.options.map((o) => (
									<SelectItem key={optionValue(o)} value={optionValue(o)}>
										{typeof o === 'string' ? value(f.field, o, f.labels) : o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					))}
				</div>
			) : null}

			{list.isError && !page ? (
				<Alert variant="destructive">
					<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
						{errorText(list.error)}
						<Button variant="outline" size="sm" onClick={() => list.refetch()}>
							{t('common:error.retry')}
						</Button>
					</AlertDescription>
				</Alert>
			) : !page ? (
				<div className="grid gap-2" aria-busy>
					{Array.from({ length: 5 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : page.items.length === 0 ? (
				filtered ? (
					<EmptyState
						icon={SearchX}
						title={t('common:resource.noResults')}
						description={t('common:resource.noResultsHint')}
						action={
							<Button
								variant="outline"
								onClick={() => {
									setQ('')
									onSearch({ sort: search.sort, dir: search.dir })
								}}
							>
								{t('common:resource.resetFilters')}
							</Button>
						}
					/>
				) : (
					<EmptyState title={r('empty.title')} description={r('empty.description')} action={createButton('empty')} />
				)
			) : (
				<>
					<ResourceTable
						resource={resource}
						rows={page.items}
						sort={input.sort ? { by: input.sort, dir: input.dir ?? 'asc' } : undefined}
						onSort={(s) => onSearch({ ...search, sort: s?.by, dir: s?.dir, page: undefined })}
						actionsFor={actionsFor}
						onAction={onAction}
						pending={list.isFetching}
					/>
					<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
						<span data-testid={`resource-${resource.key}-range`}>
							{t('common:resource.range', { from, to, total: page.total })}
						</span>
						{page.total > page.pageSize ? (
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={page.page <= 1}
									onClick={() => onSearch({ ...search, page: page.page - 1 > 1 ? page.page - 1 : undefined })}
									data-testid={`resource-${resource.key}-prev`}
								>
									{t('common:resource.prev')}
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={to >= page.total}
									onClick={() => onSearch({ ...search, page: page.page + 1 })}
									data-testid={`resource-${resource.key}-next`}
								>
									{t('common:resource.next')}
								</Button>
							</div>
						) : null}
					</div>
				</>
			)}

			{resource.create?.mode === 'dialog' ? (
				<Dialog open={creating} onOpenChange={setCreating}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{r('create.title')}</DialogTitle>
							<DialogDescription>{r('create.description', { defaultValue: '' })}</DialogDescription>
						</DialogHeader>
						{createForm}
					</DialogContent>
				</Dialog>
			) : (
				<Sheet open={creating} onOpenChange={setCreating}>
					<SheetContent className="w-full sm:max-w-md">
						<SheetHeader>
							<SheetTitle>{r('create.title')}</SheetTitle>
							<SheetDescription>{r('create.description', { defaultValue: '' })}</SheetDescription>
						</SheetHeader>
						<div className="px-4">{createForm}</div>
					</SheetContent>
				</Sheet>
			)}

			<Dialog open={Boolean(active?.action.form)} onOpenChange={(open) => !open && setActive(undefined)}>
				<DialogContent>
					{active?.action.form ? (
						<>
							<DialogHeader>
								<DialogTitle>{r(`actions.${active.action.key}.title`, { ...active.row })}</DialogTitle>
								<DialogDescription>
									{r(`actions.${active.action.key}.description`, { ...active.row, defaultValue: '' })}
								</DialogDescription>
							</DialogHeader>
							<ResourceForm
								ns={resource.ns}
								resourceKey={resource.key}
								form={active.action.form as FormDef<z.ZodObject>}
								defaultValues={active.action.form.initial?.(active.row)}
								submitLabel={r(`actions.${active.action.key}.submit`)}
								onCancel={() => setActive(undefined)}
								testId={`resource-${resource.key}-action-${active.action.key}-form`}
								onSubmit={(values) => run(active.action, active.row, values)}
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={Boolean(active && !active.action.form && active.action.confirm)}
				onOpenChange={(open) => !open && setActive(undefined)}
			>
				<AlertDialogContent>
					{active ? (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>{r(`actions.${active.action.key}.title`, { ...active.row })}</AlertDialogTitle>
								<AlertDialogDescription>
									{r(`actions.${active.action.key}.description`, { ...active.row, defaultValue: '' })}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
								<AlertDialogAction
									variant={active.action.variant === 'destructive' ? 'destructive' : 'default'}
									data-testid={`resource-${resource.key}-confirm`}
									onClick={(e) => {
										e.preventDefault()
										run(active.action, active.row).catch((err) => toast.error(errorText(err)))
									}}
								>
									{r(`actions.${active.action.key}.submit`)}
								</AlertDialogAction>
							</AlertDialogFooter>
						</>
					) : null}
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
