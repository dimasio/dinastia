// Редактор rich text (скилл rich-text): Tiptap с расширениями профиля, панель — только то, что профиль разрешает.
// Наружу — документ, приведённый к профилю (sanitizeRichText): сервер его примет. Грузится лениво (index.ts).
import {
	emptyDoc,
	HEADING_LEVELS,
	isAllowedHref,
	RICH_TEXT_COLORS,
	RICH_TEXT_PROFILES,
	type RichTextDoc,
	type RichTextProfile,
	sanitizeRichText,
} from '@dinastia/contracts/common'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
	Bold,
	Code,
	Heading,
	Highlighter,
	ImagePlus,
	Italic,
	Link,
	List,
	ListChecks,
	ListOrdered,
	Minus,
	Palette,
	Quote,
	Redo2,
	SquareCode,
	Strikethrough,
	Table,
	Underline,
	Undo2,
} from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/utils.ts'
import { Button } from '../components/ui/button.tsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx'
import { Input } from '../components/ui/input.tsx'
import { richTextExtensions } from './extensions.ts'

type T = (key: string, options?: Record<string, unknown>) => string

export interface RichTextEditorProps {
	profile: RichTextProfile
	value: RichTextDoc | null | undefined
	onChange: (doc: RichTextDoc) => void
	placeholder?: string
	/** Загрузить картинку (files → fileId) и вернуть адрес для показа; без неё кнопки картинки нет. */
	uploadImage?: (file: File) => Promise<{ fileId: string; url: string }>
	/** Адрес уже сохранённой картинки по fileId. */
	resolveFile?: (fileId: string) => string | undefined
	id?: string
	invalid?: boolean
	disabled?: boolean
	'aria-label'?: string
	'aria-describedby'?: string
	testId?: string
	className?: string
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export default function RichTextEditor(props: RichTextEditorProps) {
	const { profile, value, onChange, placeholder, uploadImage, resolveFile } = props
	const { t: raw } = useTranslation()
	const t = raw as unknown as T
	// Превью только что загруженных картинок (до сохранения у них ещё нет подписанной ссылки с сервера).
	const uploaded = useRef(new Map<string, string>())
	const resolve = useRef(resolveFile)
	resolve.current = resolveFile
	const emitted = useRef<RichTextDoc | null>(null)

	const extensions = useMemo(
		() =>
			richTextExtensions(profile, {
				...(placeholder ? { placeholder } : {}),
				resolveFile: (id) => uploaded.current.get(id) ?? resolve.current?.(id),
			}),
		[profile, placeholder],
	)
	const editor = useEditor(
		{
			extensions,
			content: value ?? emptyDoc(),
			editable: !props.disabled,
			editorProps: {
				attributes: {
					class: cn('rt rt-editor', props.className),
					role: 'textbox',
					'aria-multiline': 'true',
					...(props.id ? { id: props.id } : {}),
					...(props['aria-label'] ? { 'aria-label': props['aria-label'] } : {}),
					...(props['aria-describedby'] ? { 'aria-describedby': props['aria-describedby'] } : {}),
					...(props.invalid ? { 'aria-invalid': 'true' } : {}),
					...(props.testId ? { 'data-testid': props.testId } : {}),
				},
			},
			onUpdate: ({ editor }) => {
				const doc = sanitizeRichText(editor.getJSON(), profile)
				emitted.current = doc
				onChange(doc)
			},
		},
		[extensions],
	)

	// Значение сменили снаружи (сброс формы, загрузка записи) — показать его, не отправляя onChange обратно.
	// Пустое значение (необязательное поле формы) = пустой документ. Экземпляр мог быть уничтожен (StrictMode
	// пересоздаёт компонент) — тогда его команды недоступны.
	useEffect(() => {
		if (!editor || editor.isDestroyed) return
		const next = value ?? emptyDoc()
		if (same(next, emitted.current) || same(next, editor.getJSON())) return
		editor.commands.setContent(next, { emitUpdate: false })
	}, [editor, value])

	useEffect(() => {
		if (editor && !editor.isDestroyed) editor.setEditable(!props.disabled)
	}, [editor, props.disabled])

	return (
		<div
			className={cn(
				'rounded-md border bg-background shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50',
				props.invalid && 'border-destructive',
			)}
		>
			{editor && (
				<Toolbar
					editor={editor}
					profile={profile}
					t={t}
					disabled={props.disabled === true}
					{...(uploadImage
						? {
								onImage: async (file: File) => {
									const { fileId, url } = await uploadImage(file)
									uploaded.current.set(fileId, url)
									editor
										.chain()
										.focus()
										.insertFileImage({ fileId, alt: file.name.slice(0, 200) })
										.run()
								},
							}
						: {})}
				/>
			)}
			<EditorContent editor={editor} />
		</div>
	)
}

function Toolbar({
	editor,
	profile,
	t,
	disabled,
	onImage,
}: {
	editor: Editor
	profile: RichTextProfile
	t: T
	disabled: boolean
	onImage?: (file: File) => Promise<void>
}) {
	const p = RICH_TEXT_PROFILES[profile]
	const nodes = new Set<string>(p.nodes)
	const marks = new Set<string>(p.marks)
	const state = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e.isActive('bold'),
			italic: e.isActive('italic'),
			underline: e.isActive('underline'),
			strike: e.isActive('strike'),
			code: e.isActive('code'),
			link: e.isActive('link'),
			highlight: e.isActive('highlight'),
			bulletList: e.isActive('bulletList'),
			orderedList: e.isActive('orderedList'),
			taskList: e.isActive('taskList'),
			blockquote: e.isActive('blockquote'),
			codeBlock: e.isActive('codeBlock'),
			table: e.isActive('table'),
			canUndo: e.can().undo(),
			canRedo: e.can().redo(),
		}),
	})
	const [linkOpen, setLinkOpen] = useState(false)
	const file = useRef<HTMLInputElement>(null)
	const [imageError, setImageError] = useState<string>()
	const chain = () => editor.chain().focus()

	const btn = (key: string, icon: ReactNode, active: boolean, run: () => void, off = false) => (
		<Button
			key={key}
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={t(`common:richText.${key}`)}
			title={t(`common:richText.${key}`)}
			aria-pressed={active}
			data-active={active || undefined}
			className="data-[active]:bg-accent"
			disabled={disabled || off}
			onMouseDown={(e) => e.preventDefault()}
			onClick={run}
		>
			{icon}
		</Button>
	)

	return (
		<div
			role="toolbar"
			aria-label={t('common:richText.toolbar')}
			className="flex flex-wrap items-center gap-0.5 border-b p-1"
		>
			{nodes.has('heading') && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('common:richText.heading')}
							title={t('common:richText.heading')}
							disabled={disabled}
						>
							<Heading />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onSelect={() => chain().setParagraph().run()}>
							{t('common:richText.paragraph')}
						</DropdownMenuItem>
						{HEADING_LEVELS.map((level) => (
							<DropdownMenuItem key={level} onSelect={() => chain().toggleHeading({ level }).run()}>
								{t('common:richText.headingLevel', { level: level - 1 })}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{marks.has('bold') && btn('bold', <Bold />, state.bold, () => chain().toggleBold().run())}
			{marks.has('italic') && btn('italic', <Italic />, state.italic, () => chain().toggleItalic().run())}
			{marks.has('underline') &&
				btn('underline', <Underline />, state.underline, () => chain().toggleUnderline().run())}
			{marks.has('strike') && btn('strike', <Strikethrough />, state.strike, () => chain().toggleStrike().run())}
			{marks.has('code') && btn('code', <Code />, state.code, () => chain().toggleCode().run())}
			{marks.has('highlight') &&
				btn('highlight', <Highlighter />, state.highlight, () => chain().toggleHighlight().run())}
			{marks.has('textStyle') && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('common:richText.color')}
							title={t('common:richText.color')}
							disabled={disabled}
						>
							<Palette />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{Object.keys(RICH_TEXT_COLORS).map((c) => (
							<DropdownMenuItem key={c} onSelect={() => chain().setTextColor(c).run()}>
								<span className={cn('size-3 rounded-full bg-current', `rt-color-${c}`)} aria-hidden />
								{t(`common:richText.colors.${c}`)}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => chain().unsetTextColor().run()}>
							{t('common:richText.colors.none')}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{marks.has('link') && btn('link', <Link />, state.link, () => setLinkOpen(true))}
			{nodes.has('bulletList') && btn('bulletList', <List />, state.bulletList, () => chain().toggleBulletList().run())}
			{nodes.has('orderedList') &&
				btn('orderedList', <ListOrdered />, state.orderedList, () => chain().toggleOrderedList().run())}
			{nodes.has('taskList') && btn('taskList', <ListChecks />, state.taskList, () => chain().toggleTaskList().run())}
			{nodes.has('blockquote') &&
				btn('blockquote', <Quote />, state.blockquote, () => chain().toggleBlockquote().run())}
			{nodes.has('codeBlock') &&
				btn('codeBlock', <SquareCode />, state.codeBlock, () => chain().toggleCodeBlock().run())}
			{nodes.has('horizontalRule') && btn('horizontalRule', <Minus />, false, () => chain().setHorizontalRule().run())}
			{nodes.has('table') && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('common:richText.table')}
							title={t('common:richText.table')}
							disabled={disabled}
						>
							<Table />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
							{t('common:richText.tableInsert')}
						</DropdownMenuItem>
						{state.table && (
							<>
								<DropdownMenuItem onSelect={() => chain().addRowAfter().run()}>
									{t('common:richText.tableAddRow')}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => chain().addColumnAfter().run()}>
									{t('common:richText.tableAddColumn')}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => chain().deleteRow().run()}>
									{t('common:richText.tableDeleteRow')}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => chain().deleteColumn().run()}>
									{t('common:richText.tableDeleteColumn')}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem variant="destructive" onSelect={() => chain().deleteTable().run()}>
									{t('common:richText.tableDelete')}
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{nodes.has('image') && onImage && (
				<>
					{btn('image', <ImagePlus />, false, () => file.current?.click())}
					<input
						ref={file}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						className="hidden"
						onChange={async (e) => {
							const f = e.target.files?.[0]
							e.target.value = ''
							if (!f) return
							setImageError(undefined)
							try {
								await onImage(f)
							} catch {
								setImageError(t('common:richText.imageFailed'))
							}
						}}
					/>
				</>
			)}
			<span className="ms-auto flex gap-0.5">
				{btn('undo', <Undo2 />, false, () => chain().undo().run(), !state.canUndo)}
				{btn('redo', <Redo2 />, false, () => chain().redo().run(), !state.canRedo)}
			</span>
			{imageError && (
				<p role="alert" className="w-full px-1 text-destructive text-sm">
					{imageError}
				</p>
			)}
			<LinkDialog
				open={linkOpen}
				onOpenChange={setLinkOpen}
				initial={(editor.getAttributes('link').href as string | undefined) ?? ''}
				t={t}
				onSubmit={(href) => {
					if (!href) chain().extendMarkRange('link').unsetLink().run()
					else chain().extendMarkRange('link').setLink({ href }).run()
				}}
			/>
		</div>
	)
}

function LinkDialog({
	open,
	onOpenChange,
	initial,
	onSubmit,
	t,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	initial: string
	onSubmit: (href: string) => void
	t: T
}) {
	const id = useId()
	const [href, setHref] = useState(initial)
	const [error, setError] = useState<string>()
	useEffect(() => {
		if (open) {
			setHref(initial)
			setError(undefined)
		}
	}, [open, initial])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t('common:richText.linkTitle')}</DialogTitle>
				</DialogHeader>
				<form
					className="grid gap-2"
					onSubmit={(e) => {
						e.preventDefault()
						const value = href.trim()
						const withProtocol = value && !/^[a-z]+:/i.test(value) ? `https://${value}` : value
						if (withProtocol && !isAllowedHref(withProtocol)) return setError(t('common:richText.linkInvalid'))
						onSubmit(withProtocol)
						onOpenChange(false)
					}}
				>
					<Input
						id={id}
						value={href}
						onChange={(e) => setHref(e.target.value)}
						placeholder="https://"
						aria-label={t('common:richText.linkUrl')}
						aria-invalid={error ? true : undefined}
						autoFocus
					/>
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					<DialogFooter>
						{initial && (
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									onSubmit('')
									onOpenChange(false)
								}}
							>
								{t('common:richText.linkRemove')}
							</Button>
						)}
						<Button type="submit">{t('common:richText.linkSave')}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
