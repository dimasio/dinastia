// Переписка по работе (карточка 3.5): лента комментариев и поле нового комментария — общие для экрана проверки и панели
// задания ученика. Комментарий — текст (профиль `comment`) и/или до 3 файлов (`assessments.comment-file`).
import { COMMENT_FILE, COMMENT_FILES_MAX, type Submission } from '@dinastia/contracts/assessments'
import { emptyDoc, isEmptyDoc } from '@dinastia/contracts/common'
import { Badge, Button } from '@dinastia/ui'
import { RichTextEditor, RichTextView } from '@dinastia/ui/rich-text'
import { Paperclip, Trash2 } from 'lucide-react'
import { type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'

type Doc = NonNullable<Submission['body']>

const sizeText = (bytes: number) =>
	bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
		: `${Math.max(1, Math.round(bytes / 1024))} КБ`

export function CommentThread({
	comments,
	testId = 'comments',
}: {
	comments: Submission['comments']
	testId?: string
}) {
	const { t } = useTranslation(['assessments', 'common'])
	if (comments.length === 0) return <p className="text-muted-foreground text-sm">{t('comments.empty')}</p>
	return (
		<ul className="grid gap-2" data-testid={testId}>
			{comments.map((c) => (
				<li
					key={c.id}
					className={`rounded-md p-3 text-sm ${c.authorRole === 'student' ? 'border bg-background' : 'bg-muted'}`}
					data-testid={`${testId}-item`}
					data-role={c.authorRole}
				>
					<p className="mb-1 flex flex-wrap items-center gap-2 font-medium">
						{c.authorName}
						<Badge variant="outline" className="font-normal">
							{t(`roles.${c.authorRole}` as 'roles.student', { ns: 'common' })}
						</Badge>
						<span className="font-normal text-muted-foreground text-xs">
							{new Date(c.createdAt).toLocaleString('ru-RU', {
								day: 'numeric',
								month: 'short',
								hour: '2-digit',
								minute: '2-digit',
							})}
						</span>
					</p>
					{!isEmptyDoc(c.body) && <RichTextView doc={c.body} />}
					{c.files.length > 0 && (
						<ul className="mt-2 grid gap-1">
							{c.files.map((f) => (
								<li key={f.id} className="flex items-center gap-2 text-xs">
									<Paperclip className="size-3.5 shrink-0" aria-hidden />
									<a href={f.url} className="min-w-0 truncate underline" data-testid={`${testId}-file`}>
										{f.name}
									</a>
									<span className="text-muted-foreground">{sizeText(f.size)}</span>
								</li>
							))}
						</ul>
					)}
				</li>
			))}
		</ul>
	)
}

interface LocalFile {
	id: string
	name: string
	size: number
}

/**
 * Поле нового комментария: текст и файлы. `onSend` вызывается с содержимым (текст — `null`, если пуст); после успеха поле
 * очищается. `actions` — дополнительные кнопки справа от «Отправить» (решения проверяющего), им доступно то же содержимое.
 */
export function CommentComposer(props: {
	sendLabel: string
	onSend: (value: { body: Doc | null; fileIds: string[] }) => Promise<void>
	/** Кнопки решений: получают содержимое и сами вызывают API; после успеха поле очищается. */
	decisions?: {
		key: string
		label: string
		variant?: 'default' | 'outline' | 'destructive'
		run: (value: { body: Doc | null; fileIds: string[] }) => Promise<void>
	}[]
	/** Доступность отправки (например, конечный статус). */
	disabled?: boolean
	testId: string
	children?: ReactNode
}) {
	const { t } = useTranslation(['assessments', 'errors'])
	const [body, setBody] = useState<Doc>(emptyDoc())
	const [files, setFiles] = useState<LocalFile[]>([])
	const [progress, setProgress] = useState<number | null>(null)
	const [error, setError] = useState<string>()
	const [busy, setBusy] = useState(false)
	// пересоздание редактора после отправки (он держит своё состояние)
	const [round, setRound] = useState(0)
	const input = useRef<HTMLInputElement>(null)
	const id = useId()
	const value = () => ({ body: isEmptyDoc(body) ? null : body, fileIds: files.map((f) => f.id) })
	const empty = isEmptyDoc(body) && files.length === 0

	const run = async (fn: (v: { body: Doc | null; fileIds: string[] }) => Promise<void>) => {
		setBusy(true)
		setError(undefined)
		try {
			await fn(value())
			setBody(emptyDoc())
			setFiles([])
			setRound((r) => r + 1)
		} catch (e) {
			setError(t(errorText(e), { ns: 'errors' }))
		} finally {
			setBusy(false)
		}
	}

	async function pick(list: FileList | null) {
		const file = list?.[0]
		if (!file) return
		setError(undefined)
		if (!(COMMENT_FILE.mime as readonly string[]).includes(file.type))
			return setError(t('FILE_TYPE_NOT_ALLOWED', { ns: 'errors' }))
		if (file.size > COMMENT_FILE.maxSize) return setError(t('FILE_TOO_LARGE', { ns: 'errors' }))
		setProgress(0)
		try {
			const fileId = await uploadFile(COMMENT_FILE.purpose, file, setProgress)
			setFiles((f) => [...f, { id: fileId, name: file.name, size: file.size }])
		} catch (e) {
			setError(t(errorText(e), { ns: 'errors' }))
		} finally {
			setProgress(null)
			if (input.current) input.current.value = ''
		}
	}

	return (
		<div className="grid gap-2" data-testid={props.testId}>
			<RichTextEditor
				key={round}
				profile="comment"
				value={body}
				onChange={setBody}
				aria-label={t('comments.write')}
				placeholder={t('comments.write')}
				{...(props.disabled ? { disabled: true } : {})}
				testId={`${props.testId}-body`}
			/>
			{files.length > 0 && (
				<ul className="grid gap-1">
					{files.map((f) => (
						<li key={f.id} className="flex items-center gap-2 text-sm" data-testid={`${props.testId}-file`}>
							<Paperclip className="size-4 shrink-0" aria-hidden />
							<span className="min-w-0 flex-1 truncate">{f.name}</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t('assignment.removeFile', { name: f.name })}
								onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			)}
			{progress !== null && (
				<div
					role="progressbar"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
					className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"
				>
					<div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
				</div>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm" data-testid={`${props.testId}-error`}>
					{error}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<input
					ref={input}
					id={id}
					type="file"
					accept={COMMENT_FILE.mime.join(',')}
					className="sr-only"
					disabled={props.disabled || progress !== null || files.length >= COMMENT_FILES_MAX}
					onChange={(e) => pick(e.target.files)}
					data-testid={`${props.testId}-file-input`}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={props.disabled || progress !== null || files.length >= COMMENT_FILES_MAX}
					onClick={() => input.current?.click()}
				>
					<Paperclip />
					{t('comments.attach')}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={props.disabled || busy || empty || progress !== null}
					onClick={() => run(props.onSend)}
					data-testid={`${props.testId}-send`}
				>
					{props.sendLabel}
				</Button>
				{props.decisions?.map((d) => (
					<Button
						key={d.key}
						size="sm"
						variant={d.variant ?? 'default'}
						disabled={props.disabled || busy || progress !== null}
						onClick={() => run(d.run)}
						data-testid={`${props.testId}-${d.key}`}
					>
						{d.label}
					</Button>
				))}
			</div>
			{props.children}
		</div>
	)
}
