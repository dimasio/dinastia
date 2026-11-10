// Вкладка «Потоки» курса (карточка 4.2): потоки с датами, сроком и кураторами; создать, изменить, удалить. Своими
// компонентами, без ресурса: форме нужен множественный выбор кураторов. Куратор видит только свои потоки, без действий.
import type { GroupRow } from '@dinastia/contracts/learning'
import { formatDate } from '@dinastia/i18n'
import {
	Alert,
	AlertDescription,
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Badge,
	Button,
	EmptyState,
	Field,
	Input,
	PageHeader,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Skeleton,
	toast,
} from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { CourseTabs } from '../courses/course-tabs.tsx'

/** Дата из поля `<input type="date">` (полночь по местному времени) и обратно. */
const fromInput = (v: string) => (v ? new Date(`${v}T00:00:00`) : null)
const toInput = (d: Date | string | null) => {
	if (!d) return ''
	const x = new Date(d)
	return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function Groups({ courseId }: { courseId: string }) {
	const { t } = useTranslation(['learning', 'errors'])
	const qc = useQueryClient()
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('learning.groups.manage') ?? false
	const listOpts = orpc.learning.groups.list.queryOptions({ input: { courseId } })
	const list = useQuery(listOpts)
	const [editing, setEditing] = useState<GroupRow | 'new'>()
	const [removing, setRemoving] = useState<GroupRow>()
	const refresh = () => qc.invalidateQueries({ queryKey: listOpts.queryKey })
	const period = (g: GroupRow) =>
		g.startsAt && g.endsAt
			? t('learning:groups.period.both', { from: formatDate(g.startsAt), to: formatDate(g.endsAt) })
			: g.startsAt
				? t('learning:groups.period.from', { from: formatDate(g.startsAt) })
				: g.endsAt
					? t('learning:groups.period.to', { to: formatDate(g.endsAt) })
					: t('learning:groups.period.none')
	const remove = useMutation({
		...orpc.learning.groups.remove.mutationOptions(),
		onSuccess: () => {
			toast.success(t('learning:groups.removed', { title: removing?.title }))
			setRemoving(undefined)
			refresh()
		},
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	const createButton = canManage ? (
		<Button onClick={() => setEditing('new')} data-testid="group-create">
			<Plus />
			{t('learning:groups.create')}
		</Button>
	) : null

	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-4">
			<CourseTabs courseId={courseId} active="groups" />
			<PageHeader
				title={t('learning:groups.title')}
				description={t('learning:groups.description')}
				actions={list.data?.length ? createButton : null}
			/>
			{canManage && (
				<Alert>
					<Info />
					<AlertDescription>{t('learning:groups.hint')}</AlertDescription>
				</Alert>
			)}
			{list.isPending ? (
				<div className="grid gap-3">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
			) : list.data?.length ? (
				<ul className="grid gap-3" data-testid="groups-list">
					{list.data.map((g) => (
						<li key={g.id} className="grid gap-2 rounded-lg border p-4" data-testid="group-row">
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="font-medium">{g.title}</p>
									<p className="text-sm text-muted-foreground">{period(g)}</p>
								</div>
								{canManage && (
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setEditing(g)}
											aria-label={t('learning:groups.edit', { title: g.title })}
											data-testid="group-edit"
										>
											<Pencil />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setRemoving(g)}
											aria-label={t('learning:groups.remove', { title: g.title })}
											data-testid="group-remove"
										>
											<Trash2 />
										</Button>
									</div>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
								<span className="inline-flex items-center gap-1">
									<Users className="size-4 text-muted-foreground" aria-hidden />
									{t('learning:groups.students', { count: g.students })}
								</span>
								<span className="text-muted-foreground">
									{g.accessDays
										? t('learning:groups.access', { count: g.accessDays })
										: t('learning:groups.accessCourse')}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 text-sm">
								<span className="text-muted-foreground">{t('learning:groups.curators')}:</span>
								{g.curators.length ? (
									g.curators.map((c) => (
										<Badge key={c.memberId} variant="secondary">
											{c.name}
										</Badge>
									))
								) : (
									<span>{t('learning:groups.noCurators')}</span>
								)}
							</div>
						</li>
					))}
				</ul>
			) : (
				<EmptyState
					icon={Users}
					title={t(canManage ? 'learning:groups.empty.title' : 'learning:groups.empty.titleCurator')}
					description={t(canManage ? 'learning:groups.empty.description' : 'learning:groups.empty.descriptionCurator')}
					action={createButton}
				/>
			)}
			{canManage && (
				<GroupSheet
					courseId={courseId}
					group={editing}
					onClose={() => setEditing(undefined)}
					onSaved={() => {
						setEditing(undefined)
						refresh()
					}}
				/>
			)}
			<AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(undefined)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('learning:groups.removeConfirm.title', { title: removing?.title })}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('learning:groups.removeConfirm.description', { count: removing?.students ?? 0 })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('learning:groups.cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={(e) => {
								e.preventDefault()
								if (removing) remove.mutate({ id: removing.id })
							}}
							data-testid="group-remove-confirm"
						>
							{t('learning:groups.removeConfirm.submit')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

/** Форма потока в боковой панели: название, даты, срок доступа, кураторы. */
function GroupSheet(props: {
	courseId: string
	group: GroupRow | 'new' | undefined
	onClose: () => void
	onSaved: () => void
}) {
	const { group } = props
	const open = group !== undefined
	return (
		<Sheet open={open} onOpenChange={(o) => !o && props.onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="group-sheet">
				{open && (
					<GroupForm
						key={group === 'new' ? 'new' : group.id}
						courseId={props.courseId}
						group={group === 'new' ? null : group}
						onSaved={props.onSaved}
					/>
				)}
			</SheetContent>
		</Sheet>
	)
}

function GroupForm(props: { courseId: string; group: GroupRow | null; onSaved: () => void }) {
	const { group } = props
	const { t } = useTranslation(['learning', 'errors'])
	const options = useQuery(orpc.learning.groups.curatorOptions.queryOptions())
	const [title, setTitle] = useState(group?.title ?? '')
	const [startsAt, setStartsAt] = useState(toInput(group?.startsAt ?? null))
	const [endsAt, setEndsAt] = useState(toInput(group?.endsAt ?? null))
	const [days, setDays] = useState(group?.accessDays ? String(group.accessDays) : '')
	const [curators, setCurators] = useState<string[]>(group?.curators.map((c) => c.memberId) ?? [])
	const [error, setError] = useState<string>()
	const onError = (e: unknown) => setError(t(errorText(e), { ns: 'errors' }))
	const onSuccess = (g: GroupRow) => {
		toast.success(t(group ? 'learning:groups.saved' : 'learning:groups.created', { title: g.title }))
		props.onSaved()
	}
	const create = useMutation({ ...orpc.learning.groups.create.mutationOptions(), onSuccess, onError })
	const update = useMutation({ ...orpc.learning.groups.update.mutationOptions(), onSuccess, onError })
	const accessDays = days.trim() === '' ? null : Number(days)
	const daysInvalid = accessDays !== null && !(Number.isInteger(accessDays) && accessDays >= 1 && accessDays <= 3650)
	const datesInvalid = Boolean(startsAt && endsAt && endsAt < startsAt)
	const invalid = !title.trim() || daysInvalid || datesInvalid
	const pending = create.isPending || update.isPending

	function submit(e: React.FormEvent) {
		e.preventDefault()
		if (invalid) return
		setError(undefined)
		const fields = {
			title: title.trim(),
			startsAt: fromInput(startsAt),
			endsAt: fromInput(endsAt),
			accessDays,
			curatorIds: curators,
		}
		if (group) update.mutate({ id: group.id, ...fields })
		else create.mutate({ courseId: props.courseId, ...fields })
	}

	return (
		<>
			<SheetHeader>
				<SheetTitle>{t(group ? 'learning:groups.form.editTitle' : 'learning:groups.form.createTitle')}</SheetTitle>
				<SheetDescription>{t('learning:groups.form.description')}</SheetDescription>
			</SheetHeader>
			<form className="grid gap-4 px-4 pb-4" onSubmit={submit} data-testid="group-form">
				<Field id="group-title" label={t('learning:groups.form.title')}>
					<Input
						id="group-title"
						value={title}
						maxLength={120}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={t('learning:groups.form.titlePlaceholder')}
						data-testid="group-title"
					/>
				</Field>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Field id="group-starts" label={t('learning:groups.form.startsAt')}>
						<Input
							id="group-starts"
							type="date"
							value={startsAt}
							onChange={(e) => setStartsAt(e.target.value)}
							data-testid="group-starts"
						/>
					</Field>
					<Field
						id="group-ends"
						label={t('learning:groups.form.endsAt')}
						error={datesInvalid ? t('GROUP_DATES', { ns: 'errors' }) : undefined}
					>
						<Input
							id="group-ends"
							type="date"
							value={endsAt}
							onChange={(e) => setEndsAt(e.target.value)}
							aria-invalid={datesInvalid}
							data-testid="group-ends"
						/>
					</Field>
				</div>
				<Field
					id="group-days"
					label={t('learning:groups.form.accessDays')}
					hint={t('learning:groups.form.accessDaysHint')}
					error={daysInvalid ? t('learning:groups.form.accessDaysInvalid') : undefined}
				>
					<Input
						id="group-days"
						inputMode="numeric"
						value={days}
						onChange={(e) => setDays(e.target.value)}
						aria-invalid={daysInvalid}
						data-testid="group-days"
					/>
				</Field>
				<fieldset className="grid gap-2">
					<legend className="mb-1 text-sm font-medium">{t('learning:groups.form.curators')}</legend>
					<p className="text-sm text-muted-foreground">{t('learning:groups.form.curatorsHint')}</p>
					{options.data?.length === 0 && (
						<p className="text-sm text-muted-foreground">{t('learning:groups.form.noStaff')}</p>
					)}
					<ul className="grid gap-1" data-testid="group-curators">
						{options.data?.map((o) => {
							const id = `curator-${o.memberId}`
							const checked = curators.includes(o.memberId)
							return (
								<li key={o.memberId}>
									<label
										htmlFor={id}
										className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
									>
										<input
											id={id}
											type="checkbox"
											className="size-4 accent-primary"
											checked={checked}
											onChange={() =>
												setCurators((list) => (checked ? list.filter((x) => x !== o.memberId) : [...list, o.memberId]))
											}
										/>
										<span className="min-w-0">
											<span className="block truncate text-sm">{o.name}</span>
											<span className="block truncate text-xs text-muted-foreground">{o.email}</span>
										</span>
									</label>
								</li>
							)
						})}
					</ul>
				</fieldset>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<Button type="submit" disabled={invalid || pending} data-testid="group-submit">
					{t(group ? 'learning:groups.form.save' : 'learning:groups.form.create')}
				</Button>
			</form>
		</>
	)
}
