// Конструктор курса (карточки 2.2, 2.3; шаблон «Карточка» — скилл screen-design): дерево разделов и уроков, порядок
// перетаскиванием (dnd-kit) и из меню, переименование по месту, удаление с подтверждением. Изменения — сразу через
// API 2.1; дерево обновляется оптимистично и откатывается при ошибке. Публикация (2.5): статус у уроков,
// «Опубликовать изменения (N)» — все изменённые уроки разом, «Опубликовать курс» — у черновика.
import { COURSE_COVER, type Course, type Lesson, lessonStatus } from '@dinastia/contracts/courses'
import {
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	EmptyState,
	ImageInput,
	Input,
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
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, GripVertical, MoreHorizontal, Plus, Send } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { CourseTabs } from '../course-tabs.tsx'
import { errorData, LessonStatusBadge } from '../publish.tsx'

type Section = Course['sections'][number]
type Confirm = { title: string; description: string; run: () => void } | null

/** Переставить элемент `id` на позицию `index` массива. */
const moveTo = <T extends { id: string }>(items: T[], id: string, index: number): T[] => {
	const item = items.find((x) => x.id === id)
	if (!item) return items
	const rest = items.filter((x) => x.id !== id)
	rest.splice(Math.min(index, rest.length), 0, item)
	return rest
}

export function CourseBuilder({ courseId }: { courseId: string }) {
	const { t } = useTranslation(['courses', 'common', 'errors'])
	const qc = useQueryClient()
	const navigate = useNavigate()
	const query = orpc.courses.get.queryOptions({ input: { id: courseId } })
	const { data: course, isPending, error } = useQuery(query)
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('courses.manage') ?? false
	const canPublish = me?.permissions.includes('courses.publish') ?? false
	// текст подтверждения живёт до конца анимации закрытия (иначе заголовок мигает пустым); открыт — отдельный флаг
	const [confirm, setConfirmData] = useState<Confirm>(null)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const setConfirm = (c: NonNullable<Confirm>) => {
		setConfirmData(c)
		setConfirmOpen(true)
	}
	const [addingSection, setAddingSection] = useState(false)

	/** Оптимистично поменять дерево, выполнить запрос; ошибка — откат и тост с текстом кода. */
	const change = useMutation({
		mutationFn: async (op: { apply?: (c: Course) => Course; call: () => Promise<unknown> }) => op.call(),
		onMutate: async (op) => {
			await qc.cancelQueries({ queryKey: query.queryKey })
			const prev = qc.getQueryData<Course>(query.queryKey)
			if (prev && op.apply) qc.setQueryData(query.queryKey, op.apply(prev))
			return { prev }
		},
		onError: (e, _op, ctx) => {
			if (ctx?.prev) qc.setQueryData(query.queryKey, ctx.prev)
			toast.error(t(errorText(e), { ns: 'errors' }))
		},
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: query.queryKey })
			void qc.invalidateQueries({ queryKey: orpc.courses.list.key() })
		},
	})

	/** Публикация курса или всех изменённых уроков: ответ — курс целиком (статусы уроков уже новые). */
	const publish = useMutation({
		mutationFn: (op: { kind: 'course' | 'changes'; count: number }) =>
			op.kind === 'course'
				? orpc.courses.publish.call({ id: courseId })
				: orpc.courses.publishChanges.call({ id: courseId }),
		onSuccess: (saved, op) => {
			qc.setQueryData(query.queryKey, saved)
			void qc.invalidateQueries({ queryKey: orpc.courses.list.key() })
			toast.success(op.kind === 'course' ? t('publish.courseDone') : t('publish.changesDone', { count: op.count }))
		},
		onError: (e) => {
			const lessons = errorData<{ lessons?: { title: string }[] }>(e)?.lessons
			toast.error(t(errorText(e), { ns: 'errors' }), {
				description: lessons?.length
					? t('publish.issueLessons', { list: lessons.map((l) => `«${l.title}»`).join(', ') })
					: undefined,
			})
		},
	})

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	if (isPending) return <Skeleton className="h-64 w-full" data-testid="course-builder-loading" />
	if (error || !course) return <EmptyState icon={BookOpen} title={t(errorText(error), { ns: 'errors' })} />

	const sections = course.sections
	const setCover = async (coverFileId: string | null) =>
		qc.setQueryData(query.queryKey, await orpc.courses.update.call({ id: course.id, coverFileId }))
	const unpublished = sections.flatMap((s) => s.lessons).filter((l) => lessonStatus(l) !== 'published').length
	const sectionOf = (lessonId: string) => sections.find((s) => s.lessons.some((l) => l.id === lessonId))

	const moveSection = (id: string, index: number) =>
		change.mutate({
			apply: (c) => ({ ...c, sections: moveTo(c.sections, id, index) }),
			call: () => orpc.courses.sections.move.call({ id, index }),
		})

	const moveLesson = (id: string, sectionId: string, index: number) =>
		change.mutate({
			apply: (c) => {
				const lesson = c.sections.flatMap((s) => s.lessons).find((l) => l.id === id)
				if (!lesson) return c
				return {
					...c,
					sections: c.sections.map((s) => {
						const without = s.lessons.filter((l) => l.id !== id)
						if (s.id !== sectionId) return { ...s, lessons: without }
						without.splice(Math.min(index, without.length), 0, { ...lesson, sectionId })
						return { ...s, lessons: without }
					}),
				}
			},
			call: () => orpc.courses.lessons.move.call({ id, sectionId, index }),
		})

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return
		const [kind, id] = String(active.id).split(':') as ['s' | 'l', string]
		const [overKind, overId] = String(over.id).split(':') as ['s' | 'l', string]
		if (kind === 's') {
			const target = overKind === 's' ? overId : sectionOf(overId)?.id
			const index = sections.findIndex((s) => s.id === target)
			if (index >= 0) moveSection(id, index)
			return
		}
		const targetSection = overKind === 's' ? sections.find((s) => s.id === overId) : sectionOf(overId)
		if (!targetSection) return
		const index =
			overKind === 's' ? targetSection.lessons.length : targetSection.lessons.findIndex((l) => l.id === overId)
		moveLesson(id, targetSection.id, Math.max(index, 0))
	}

	const lessonsLabel = (n: number) => t('builder.lessonsCount', { count: n })

	return (
		<div className="grid gap-6" data-testid="course-builder">
			<CourseTabs courseId={course.id} active="content" />
			<div className="grid gap-2">
				<Link
					to="/admin/courses"
					className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:underline"
				>
					<ArrowLeft className="size-4" aria-hidden />
					{t('builder.back')}
				</Link>
				{canManage ? (
					<ImageInput
						preview="wide"
						value={course.coverUrl}
						name={t('builder.cover.alt', { title: course.title })}
						accept={COURSE_COVER.mime}
						maxSize={COURSE_COVER.maxSize}
						uploadLabel={t('builder.cover.upload')}
						upload={async (file, onProgress) => setCover(await uploadFile(COURSE_COVER.purpose, file, onProgress))}
						onRemove={() => setCover(null)}
						errorText={(e) => t(errorText(e), { ns: 'errors' })}
						testId="course-cover"
					/>
				) : (
					course.coverUrl && (
						<img
							src={course.coverUrl}
							alt={t('builder.cover.alt', { title: course.title })}
							className="aspect-video w-full max-w-xs rounded-md border object-cover"
							data-testid="course-cover-preview"
						/>
					)
				)}
				<div className="flex flex-wrap items-center gap-3">
					<InlineTitle
						value={course.title}
						canEdit={canManage}
						className="font-semibold text-2xl"
						testId="course-title"
						renameLabel={t('builder.rename')}
						onSave={(title) =>
							change.mutate({
								apply: (c) => ({ ...c, title }),
								call: () => orpc.courses.update.call({ id: course.id, title }),
							})
						}
					/>
					<Badge variant="outline" data-testid="course-status">
						{t(`courses.values.status.${course.status}`)}
					</Badge>
					{canPublish && (
						<div className="flex flex-wrap gap-2 sm:ml-auto">
							{unpublished > 0 && (
								<Button
									variant={course.status === 'draft' ? 'outline' : 'default'}
									disabled={publish.isPending}
									onClick={() => publish.mutate({ kind: 'changes', count: unpublished })}
									data-testid="course-publish-changes"
								>
									{t('publish.changes', { count: unpublished })}
								</Button>
							)}
							{course.status === 'draft' && (
								<Button
									disabled={publish.isPending}
									onClick={() => publish.mutate({ kind: 'course', count: 0 })}
									data-testid="course-publish"
								>
									<Send />
									{t('publish.course')}
								</Button>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="border-b">
				<span className="inline-block border-primary border-b-2 pb-2 font-medium text-sm">
					{t('builder.tabs.content')}
				</span>
			</div>

			{sections.length === 0 && !addingSection ? (
				<EmptyState
					icon={BookOpen}
					title={t('builder.empty.title')}
					description={t('builder.empty.description')}
					action={
						canManage ? (
							<Button onClick={() => setAddingSection(true)} data-testid="course-add-section">
								<Plus />
								{t('builder.addSection')}
							</Button>
						) : undefined
					}
				/>
			) : (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
					<SortableContext items={sections.map((s) => `s:${s.id}`)} strategy={verticalListSortingStrategy}>
						<ol className="grid gap-3">
							{sections.map((section, si) => (
								<SectionItem
									key={section.id}
									section={section}
									number={si + 1}
									canManage={canManage}
									lessonsLabel={lessonsLabel(section.lessons.length)}
									menuItems={[
										{ key: 'rename', label: t('builder.rename'), run: 'rename' },
										{
											key: 'up',
											label: t('builder.up'),
											run: () => moveSection(section.id, si - 1),
											disabled: si === 0,
										},
										{
											key: 'down',
											label: t('builder.down'),
											run: () => moveSection(section.id, si + 1),
											disabled: si === sections.length - 1,
										},
										{
											key: 'remove',
											label: t('builder.removeSection'),
											destructive: true,
											run: () =>
												setConfirm({
													title: t('builder.confirmSection.title', { title: section.title }),
													description: t('builder.confirmSection.description', { count: section.lessons.length }),
													run: () =>
														change.mutate({
															apply: (c) => ({ ...c, sections: c.sections.filter((s) => s.id !== section.id) }),
															call: () => orpc.courses.sections.remove.call({ id: section.id }),
														}),
												}),
										},
									]}
									onRename={(title) =>
										change.mutate({
											apply: (c) => ({
												...c,
												sections: c.sections.map((s) => (s.id === section.id ? { ...s, title } : s)),
											}),
											call: () => orpc.courses.sections.rename.call({ id: section.id, title }),
										})
									}
									onAddLesson={(title) =>
										change.mutate({ call: () => orpc.courses.lessons.create.call({ sectionId: section.id, title }) })
									}
								>
									<SortableContext
										items={section.lessons.map((l) => `l:${l.id}`)}
										strategy={verticalListSortingStrategy}
									>
										{section.lessons.map((lesson, li) => (
											<LessonItem
												key={lesson.id}
												lesson={lesson}
												courseId={course.id}
												canManage={canManage}
												onRename={(title) =>
													change.mutate({
														apply: (c) => ({
															...c,
															sections: c.sections.map((s) => ({
																...s,
																lessons: s.lessons.map((l) => (l.id === lesson.id ? { ...l, title } : l)),
															})),
														}),
														call: () => orpc.courses.lessons.rename.call({ id: lesson.id, title }),
													})
												}
												menuItems={[
													{ key: 'rename', label: t('builder.rename'), run: 'rename' },
													{
														key: 'up',
														label: t('builder.up'),
														run: () => moveLesson(lesson.id, section.id, li - 1),
														disabled: li === 0,
													},
													{
														key: 'down',
														label: t('builder.down'),
														run: () => moveLesson(lesson.id, section.id, li + 1),
														disabled: li === section.lessons.length - 1,
													},
													{
														key: 'to',
														label: t('builder.toSection'),
														sub: sections
															.filter((s) => s.id !== section.id)
															.map((s) => ({
																key: s.id,
																label: s.title,
																run: () => moveLesson(lesson.id, s.id, s.lessons.length),
															})),
													},
													{
														key: 'open',
														label: t('builder.openLesson'),
														run: () =>
															navigate({
																to: '/admin/courses/$courseId/lessons/$lessonId',
																params: { courseId: course.id, lessonId: lesson.id },
															}),
													},
													{
														key: 'remove',
														label: t('builder.removeLesson'),
														destructive: true,
														run: () =>
															setConfirm({
																title: t('builder.confirmLesson.title', { title: lesson.title }),
																description: t('builder.confirmLesson.description'),
																run: () =>
																	change.mutate({
																		apply: (c) => ({
																			...c,
																			sections: c.sections.map((s) => ({
																				...s,
																				lessons: s.lessons.filter((l) => l.id !== lesson.id),
																			})),
																		}),
																		call: () => orpc.courses.lessons.remove.call({ id: lesson.id }),
																	}),
															}),
													},
												]}
											/>
										))}
									</SortableContext>
								</SectionItem>
							))}
						</ol>
					</SortableContext>
					{canManage &&
						(addingSection ? (
							<NewItemInput
								placeholder={t('builder.newSection')}
								testId="course-new-section"
								onDone={(title) => {
									setAddingSection(false)
									if (title)
										change.mutate({ call: () => orpc.courses.sections.create.call({ courseId: course.id, title }) })
								}}
							/>
						) : (
							<Button
								variant="outline"
								className="justify-self-start"
								onClick={() => setAddingSection(true)}
								data-testid="course-add-section"
							>
								<Plus />
								{t('builder.addSection')}
							</Button>
						))}
				</DndContext>
			)}

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
						<AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							data-testid="course-confirm"
							onClick={() => {
								confirm?.run()
								setConfirmOpen(false)
							}}
						>
							{t('builder.remove')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

type MenuItem = {
	key: string
	label: string
	run?: (() => void) | 'rename'
	disabled?: boolean
	destructive?: boolean
	sub?: { key: string; label: string; run: () => void }[]
}

/** Меню ⋯ элемента дерева; «Переименовать» включает поле на месте (через onRename у владельца). */
function ItemMenu({ label, items, onRename }: { label: string; items: MenuItem[]; onRename?: () => void }) {
	// после «Переименовать» фокус остаётся в поле: иначе меню при закрытии вернёт его на ⋯, поле получит blur и закроется
	const renaming = useRef(false)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon-sm" aria-label={label} data-testid="course-item-menu">
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(e) => {
					if (renaming.current) e.preventDefault()
					renaming.current = false
				}}
			>
				{items.map((item) =>
					item.sub ? (
						item.sub.length ? (
							<DropdownMenuSub key={item.key}>
								<DropdownMenuSubTrigger data-testid={`course-menu-${item.key}`}>{item.label}</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{item.sub.map((s) => (
										<DropdownMenuItem key={s.key} onSelect={s.run} data-testid={`course-menu-to-${s.key}`}>
											{s.label}
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						) : null
					) : (
						<span key={item.key} className="contents">
							{item.destructive && <DropdownMenuSeparator />}
							<DropdownMenuItem
								disabled={item.disabled}
								variant={item.destructive ? 'destructive' : 'default'}
								onSelect={() => {
									if (item.run !== 'rename') return item.run?.()
									renaming.current = true
									onRename?.()
								}}
								data-testid={`course-menu-${item.key}`}
							>
								{item.label}
							</DropdownMenuItem>
						</span>
					),
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

/** Ручка перетаскивания — только с правом и на широком экране (на телефоне порядок — из меню). */
function Handle({
	attributes,
	listeners,
	label,
}: {
	attributes: object
	listeners: object | undefined
	label: string
}) {
	return (
		<button
			type="button"
			className="hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:block"
			aria-label={label}
			{...attributes}
			{...listeners}
		>
			<GripVertical className="size-4" aria-hidden />
		</button>
	)
}

function SectionItem(props: {
	section: Section
	number: number
	canManage: boolean
	lessonsLabel: string
	menuItems: MenuItem[]
	children: ReactNode
	onRename: (title: string) => void
	onAddLesson: (title: string) => void
}) {
	const { t } = useTranslation('courses')
	const { section } = props
	const sortable = useSortable({ id: `s:${section.id}`, disabled: !props.canManage })
	const [renaming, setRenaming] = useState(false)
	const [adding, setAdding] = useState(false)
	return (
		<li
			ref={sortable.setNodeRef}
			style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
			className={`rounded-lg border bg-card ${sortable.isDragging ? 'opacity-60 shadow-lg' : ''}`}
			data-testid="course-section"
		>
			<div className="flex items-center gap-2 border-b p-3">
				{props.canManage && (
					<Handle attributes={sortable.attributes} listeners={sortable.listeners} label={t('builder.drag')} />
				)}
				<span className="text-muted-foreground text-sm">{props.number}.</span>
				<InlineTitle
					value={section.title}
					canEdit={props.canManage}
					editing={renaming}
					onEditingChange={setRenaming}
					className="min-w-0 flex-1 font-medium"
					testId="course-section-title"
					renameLabel={t('builder.rename')}
					onSave={props.onRename}
				/>
				<span className="hidden text-muted-foreground text-xs sm:inline">{props.lessonsLabel}</span>
				{props.canManage && (
					<Button size="sm" variant="ghost" onClick={() => setAdding(true)} data-testid="course-add-lesson">
						<Plus />
						{t('builder.addLesson')}
					</Button>
				)}
				{props.canManage && (
					<ItemMenu label={t('builder.menu')} items={props.menuItems} onRename={() => setRenaming(true)} />
				)}
			</div>
			<ul className="grid gap-1 p-2">
				{props.children}
				{adding && (
					<li>
						<NewItemInput
							placeholder={t('builder.newLesson')}
							testId="course-new-lesson"
							onDone={(title) => {
								setAdding(false)
								if (title) props.onAddLesson(title)
							}}
						/>
					</li>
				)}
				{section.lessons.length === 0 && !adding && (
					<li className="px-2 py-1 text-muted-foreground text-sm">{t('builder.noLessons')}</li>
				)}
			</ul>
		</li>
	)
}

function LessonItem(props: {
	lesson: Lesson
	courseId: string
	canManage: boolean
	menuItems: MenuItem[]
	onRename: (title: string) => void
}) {
	const { t } = useTranslation('courses')
	const sortable = useSortable({ id: `l:${props.lesson.id}`, disabled: !props.canManage })
	const [renaming, setRenaming] = useState(false)
	return (
		<li
			ref={sortable.setNodeRef}
			style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
			className={`flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 ${sortable.isDragging ? 'bg-card opacity-60 shadow' : ''}`}
			data-testid="course-lesson"
		>
			{props.canManage && (
				<Handle attributes={sortable.attributes} listeners={sortable.listeners} label={t('builder.drag')} />
			)}
			<InlineTitle
				value={props.lesson.title}
				canEdit={props.canManage}
				editing={renaming}
				onEditingChange={setRenaming}
				className="min-w-0 flex-1 text-sm"
				testId="course-lesson-title"
				renameLabel={t('builder.rename')}
				onSave={props.onRename}
				link={{ courseId: props.courseId, lessonId: props.lesson.id }}
			/>
			<LessonStatusBadge lesson={props.lesson} hidePublished testId="course-lesson-status" />
			{props.canManage && (
				<ItemMenu label={t('builder.menu')} items={props.menuItems} onRename={() => setRenaming(true)} />
			)}
		</li>
	)
}

/** Название с переименованием по месту (из меню «Переименовать»): Enter — сохранить, Esc — отмена, уход из поля — сохранить. */
function InlineTitle(props: {
	value: string
	canEdit: boolean
	editing?: boolean
	onEditingChange?: (editing: boolean) => void
	className: string
	testId: string
	renameLabel: string
	onSave: (title: string) => void
	/** урок: название — ссылка на конструктор урока (карточка 2.3) */
	link?: { courseId: string; lessonId: string }
}) {
	const [own, setOwn] = useState(false)
	const editing = props.editing ?? own
	const setEditing = props.onEditingChange ?? setOwn
	const [draft, setDraft] = useState(props.value)
	if (!editing && props.link)
		return (
			<Link
				to="/admin/courses/$courseId/lessons/$lessonId"
				params={props.link}
				className={`hover:underline ${props.className}`}
				data-testid={props.testId}
			>
				{props.value}
			</Link>
		)
	if (!editing)
		return (
			<span className={props.className} data-testid={props.testId}>
				{props.value}
			</span>
		)
	const finish = (save: boolean) => {
		setEditing(false)
		const title = draft.trim()
		if (save && title && title !== props.value) props.onSave(title.slice(0, 200))
	}
	return (
		<Input
			autoFocus
			aria-label={props.renameLabel}
			className={`h-8 ${props.className}`}
			defaultValue={props.value}
			onChange={(e) => setDraft(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') finish(true)
				if (e.key === 'Escape') finish(false)
			}}
			onBlur={() => finish(true)}
			data-testid={`${props.testId}-input`}
		/>
	)
}

/** Поле нового раздела или урока: Enter — создать, Esc или пусто — отмена. */
function NewItemInput({
	placeholder,
	testId,
	onDone,
}: {
	placeholder: string
	testId: string
	onDone: (title: string) => void
}) {
	return (
		<Input
			autoFocus
			className="h-9"
			placeholder={placeholder}
			aria-label={placeholder}
			maxLength={200}
			onKeyDown={(e) => {
				if (e.key === 'Enter') onDone(e.currentTarget.value.trim())
				if (e.key === 'Escape') onDone('')
			}}
			onBlur={(e) => onDone(e.currentTarget.value.trim())}
			data-testid={testId}
		/>
	)
}
