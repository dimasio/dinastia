// Конструктор урока (карточка 2.3, шаблон «Конструктор» — скилл screen-design): палитра блоков · холст. Блок на
// холсте — карточка с редактором типа (BlockEditorHost): правка уходит на сервер через 0,5 с после последнего
// изменения, добавление, порядок и удаление — сразу. «Как увидит ученик» — черновик через toPublic типа, как на сервере.
import { type BlockType, blockDef } from '@dinastia/blocks'
import { BlockEditorHost, BlockPalette, BlockViewerHost } from '@dinastia/blocks/client'
import type { LessonBlock } from '@dinastia/contracts/courses'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	cn,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	EmptyState,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	Skeleton,
	toast,
} from '@dinastia/ui'
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, CircleAlert, FileText, GripVertical, LoaderCircle, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'

type SaveState = 'saved' | 'saving' | 'error'

/** Переставить блок `id` на позицию `index`. */
const moveTo = (items: LessonBlock[], id: string, index: number) => {
	const item = items.find((x) => x.id === id)
	if (!item) return items
	const rest = items.filter((x) => x.id !== id)
	rest.splice(Math.min(index, rest.length), 0, item)
	return rest
}

/** Данные черновика глазами ученика — как отдаст сервер после публикации (toPublic типа). */
const publicData = (block: LessonBlock) => {
	const def = blockDef(block.type)
	const parsed = def?.schema.safeParse(block.data)
	return def && parsed?.success ? def.toPublic(parsed.data) : null
}

export function LessonEditor({ courseId, lessonId }: { courseId: string; lessonId: string }) {
	const { t } = useTranslation(['courses', 'common', 'errors'])
	const qc = useQueryClient()
	const lessonQuery = orpc.courses.lessons.get.queryOptions({ input: { id: lessonId } })
	const blocksQuery = orpc.courses.blocks.list.queryOptions({ input: { lessonId } })
	const lesson = useQuery(lessonQuery)
	const blocks = useQuery(blocksQuery)
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('courses.manage') ?? false
	const [preview, setPreview] = useState(false)
	const [paletteOpen, setPaletteOpen] = useState(false)
	const [removing, setRemovingData] = useState<LessonBlock | null>(null)
	const [removeOpen, setRemoveOpen] = useState(false)

	// индикатор сохранения: сколько запросов в пути и чем кончился последний
	const [inFlight, setInFlight] = useState(0)
	const [failed, setFailed] = useState(false)
	const saveState: SaveState = inFlight > 0 ? 'saving' : failed ? 'error' : 'saved'
	const pending = useRef(0)
	pending.current = inFlight
	useEffect(() => {
		// уйти со страницы, пока правка в пути, — браузер переспросит
		const warn = (e: BeforeUnloadEvent) => {
			if (pending.current > 0) e.preventDefault()
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [])

	const setBlocks = (fn: (b: LessonBlock[]) => LessonBlock[]) =>
		qc.setQueryData<LessonBlock[]>(blocksQuery.queryKey, (prev) => (prev ? fn(prev) : prev))

	/** Запрос к серверу с индикатором; `apply` — оптимистично до ответа, ошибка — откат (кроме правки данных). */
	const save = useMutation({
		mutationFn: (op: { apply?: (b: LessonBlock[]) => LessonBlock[]; call: () => Promise<unknown>; keep?: boolean }) =>
			op.call(),
		onMutate: async (op) => {
			setInFlight((n) => n + 1)
			if (!op.apply) return { prev: undefined }
			await qc.cancelQueries({ queryKey: blocksQuery.queryKey })
			const prev = qc.getQueryData<LessonBlock[]>(blocksQuery.queryKey)
			setBlocks(op.apply)
			return { prev }
		},
		onSuccess: () => setFailed(false),
		onError: (e, _op, ctx) => {
			setFailed(true)
			if (ctx?.prev) qc.setQueryData(blocksQuery.queryKey, ctx.prev)
			toast.error(t(errorText(e), { ns: 'errors' }))
		},
		onSettled: (_d, _e, op) => {
			setInFlight((n) => n - 1)
			// правка данных — ответ уже в кэше, перечитывать список незачем (редакторы держат своё значение)
			if (!op.keep) void qc.invalidateQueries({ queryKey: blocksQuery.queryKey })
			void qc.invalidateQueries({ queryKey: lessonQuery.queryKey })
		},
	})

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	if (lesson.isPending || blocks.isPending)
		return <Skeleton className="h-64 w-full" data-testid="lesson-editor-loading" />
	if (lesson.error || blocks.error || !lesson.data || !blocks.data)
		return <EmptyState icon={FileText} title={t(errorText(lesson.error ?? blocks.error), { ns: 'errors' })} />

	const list = blocks.data
	const editing = canManage && !preview

	const add = (type: string) => {
		setPaletteOpen(false)
		save.mutate({
			call: async () => {
				const block = await orpc.courses.blocks.create.call({ lessonId, type })
				setBlocks((b) => [...b, block])
			},
		})
	}
	const move = (id: string, index: number) =>
		save.mutate({
			apply: (b) => moveTo(b, id, index),
			call: () => orpc.courses.blocks.move.call({ id, index }),
		})
	const update = (id: string, data: unknown) =>
		save.mutate({
			keep: true,
			call: async () => {
				const saved = await orpc.courses.blocks.update.call({ id, data: data as Record<string, unknown> })
				setBlocks((b) => b.map((x) => (x.id === id ? saved : x)))
			},
		})
	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return
		const index = list.findIndex((b) => b.id === over.id)
		if (index >= 0) move(String(active.id), index)
	}

	return (
		<div className="grid gap-6 pb-20 sm:pb-0" data-testid="lesson-editor">
			<header className="grid gap-3">
				<Link
					to="/admin/courses/$courseId"
					params={{ courseId }}
					className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:underline"
					data-testid="lesson-back"
				>
					<ArrowLeft className="size-4" aria-hidden />
					{lesson.data.course.title}
				</Link>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<h1 className="min-w-0 flex-1 font-semibold text-2xl" data-testid="lesson-title">
						{lesson.data.title}
					</h1>
					{canManage && <SaveIndicator state={saveState} />}
					{canManage && (
						<fieldset
							aria-label={t('lesson.mode.label')}
							className="inline-flex rounded-md border p-0.5"
							data-testid="lesson-preview-toggle"
						>
							{(['editor', 'preview'] as const).map((mode) => {
								const active = (mode === 'preview') === preview
								return (
									<button
										key={mode}
										type="button"
										aria-pressed={active}
										onClick={() => setPreview(mode === 'preview')}
										className={cn(
											'rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
											active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
										)}
										data-testid={`lesson-mode-${mode}`}
									>
										{t(`lesson.mode.${mode}`)}
									</button>
								)
							})}
						</fieldset>
					)}
				</div>
				{!canManage && <p className="text-muted-foreground text-sm">{t('lesson.readOnly')}</p>}
			</header>

			<div className={cn('grid gap-6', editing && 'sm:grid-cols-[16rem_1fr]')}>
				{editing && (
					<aside className="hidden content-start gap-3 self-start sm:sticky sm:top-4 sm:grid">
						<h2 className="font-medium text-sm">{t('lesson.palette')}</h2>
						<BlockPalette onPick={add} />
					</aside>
				)}

				<section className="grid content-start gap-4" aria-label={t('lesson.canvas')}>
					{list.length === 0 ? (
						<EmptyState
							icon={FileText}
							title={t('lesson.empty.title')}
							description={editing ? t('lesson.empty.description') : undefined}
						/>
					) : editing ? (
						<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
							<SortableContext items={list.map((b) => b.id)} strategy={verticalListSortingStrategy}>
								<ol className="grid gap-4">
									{list.map((block, i) => (
										<BlockCard
											key={block.id}
											block={block}
											first={i === 0}
											last={i === list.length - 1}
											onChange={(data) => update(block.id, data)}
											onUp={() => move(block.id, i - 1)}
											onDown={() => move(block.id, i + 1)}
											onRemove={() => {
												setRemovingData(block)
												setRemoveOpen(true)
											}}
										/>
									))}
								</ol>
							</SortableContext>
						</DndContext>
					) : (
						<article className="grid max-w-3xl gap-4" data-testid="lesson-preview">
							{list.map((block) => (
								<BlockViewerHost
									key={block.id}
									type={block.type}
									data={publicData(block)}
									testId="lesson-preview-block"
								/>
							))}
						</article>
					)}
				</section>
			</div>

			{editing && (
				<div className="fixed inset-x-0 bottom-0 border-t bg-background p-3 sm:hidden">
					<Button className="w-full" onClick={() => setPaletteOpen(true)} data-testid="lesson-add-block">
						<Plus />
						{t('lesson.addBlock')}
					</Button>
				</div>
			)}
			<Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
				<SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
					<SheetHeader>
						<SheetTitle>{t('lesson.palette')}</SheetTitle>
					</SheetHeader>
					<div className="px-4 pb-4">
						<BlockPalette onPick={add} testId="block-palette-sheet" />
					</div>
				</SheetContent>
			</Sheet>

			<AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('lesson.confirmRemove.title', {
								type: removing ? t(`${removing.type as BlockType}.title`, { ns: 'blocks' }) : '',
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>{t('lesson.confirmRemove.description')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							data-testid="lesson-confirm"
							onClick={() => {
								const id = removing?.id
								setRemoveOpen(false)
								if (id)
									save.mutate({
										apply: (b) => b.filter((x) => x.id !== id),
										call: () => orpc.courses.blocks.remove.call({ id }),
									})
							}}
						>
							{t('lesson.remove')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

function SaveIndicator({ state }: { state: SaveState }) {
	const { t } = useTranslation('courses')
	const Icon = state === 'saving' ? LoaderCircle : state === 'error' ? CircleAlert : Check
	return (
		<output
			aria-live="polite"
			className={cn(
				'flex items-center gap-1.5 text-sm',
				state === 'error' ? 'text-destructive' : 'text-muted-foreground',
			)}
			data-testid="lesson-save-state"
			data-state={state}
		>
			<Icon className={cn('size-4', state === 'saving' && 'animate-spin')} aria-hidden />
			{t(`lesson.save.${state}`)}
		</output>
	)
}

function BlockCard(props: {
	block: LessonBlock
	first: boolean
	last: boolean
	onChange: (data: unknown) => void
	onUp: () => void
	onDown: () => void
	onRemove: () => void
}) {
	const { t } = useTranslation(['courses', 'blocks'])
	const { block } = props
	const sortable = useSortable({ id: block.id })
	return (
		<li
			ref={sortable.setNodeRef}
			style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
			className={cn(
				'grid gap-3 rounded-lg border bg-card p-4',
				sortable.isDragging && 'relative z-10 opacity-80 shadow-lg',
			)}
			data-testid="lesson-block"
			data-block-id={block.id}
		>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:block"
					aria-label={t('lesson.drag')}
					{...sortable.attributes}
					{...sortable.listeners}
				>
					<GripVertical className="size-4" aria-hidden />
				</button>
				<span className="flex-1 font-medium text-sm">{t(`${block.type as BlockType}.title`, { ns: 'blocks' })}</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label={t('lesson.menu')} data-testid="lesson-block-menu">
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem disabled={props.first} onSelect={props.onUp} data-testid="lesson-menu-up">
							{t('lesson.up')}
						</DropdownMenuItem>
						<DropdownMenuItem disabled={props.last} onSelect={props.onDown} data-testid="lesson-menu-down">
							{t('lesson.down')}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onSelect={props.onRemove} data-testid="lesson-menu-remove">
							{t('lesson.remove')}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<BlockEditorHost type={block.type} value={block.data} onChange={props.onChange} testId={`block-${block.id}`} />
		</li>
	)
}
