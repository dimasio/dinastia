// Панель домашнего задания в плеере ученика (карточка 3.4): формулировка, статус, форма ответа (текст и файлы по настройкам
// блока), «Сохранить черновик» / «Отправить», в режиме чтения — отправленный ответ и комментарии проверяющего.
import { type AssignmentState, SUBMISSION_FILE, type Submission } from '@dinastia/contracts/assessments'
import { emptyDoc, isEmptyDoc } from '@dinastia/contracts/common'
import { Alert, AlertDescription, Badge, Button, Skeleton, toast } from '@dinastia/ui'
import { RichTextEditor, RichTextView } from '@dinastia/ui/rich-text'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePenLine, Paperclip, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'
import { client, orpc } from '#/app/orpc.ts'
import { CommentComposer, CommentThread } from '#/features/assessments/comments.tsx'

type Doc = NonNullable<Submission['body']>
interface LocalFile {
	id: string
	name: string
	size: number
}

const TONE = {
	draft: 'outline',
	submitted: 'secondary',
	needs_revision: 'destructive',
	accepted: 'default',
	rejected: 'destructive',
} as const

const sizeText = (bytes: number) =>
	bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
		: `${Math.max(1, Math.round(bytes / 1024))} КБ`

export function AssignmentPanel({ lessonId, blockKey }: { lessonId: string; blockKey: string }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const query = orpc.assignment.get.queryOptions({ input: { lessonId, blockKey } })
	const state = useQuery(query)
	if (state.isPending) return <Skeleton className="h-40 w-full" />
	if (state.error)
		return (
			<Alert variant="destructive">
				<AlertDescription>{t(errorText(state.error), { ns: 'errors' })}</AlertDescription>
			</Alert>
		)
	// форма держит свой ввод; после ответа сервера (key) она создаётся заново из сохранённых данных
	const s = state.data
	const key = `${s.submission?.id ?? 'new'}:${s.submission?.status ?? ''}:${s.submission?.revision ?? 0}`
	return <Assignment key={key} state={s} lessonId={lessonId} blockKey={blockKey} queryKey={query.queryKey} />
}

function Assignment(props: {
	state: AssignmentState
	lessonId: string
	blockKey: string
	queryKey: readonly unknown[]
}) {
	const { t } = useTranslation(['assessments', 'errors'])
	const qc = useQueryClient()
	const { settings, submission, canEdit } = props.state
	const [body, setBody] = useState<Doc>((submission?.body as Doc | null) ?? emptyDoc())
	const [files, setFiles] = useState<LocalFile[]>(
		submission?.files.map((f) => ({ id: f.id, name: f.name, size: f.size })) ?? [],
	)
	const [progress, setProgress] = useState<number | null>(null)
	const [error, setError] = useState<string>()
	const [busy, setBusy] = useState(false)
	const input = useRef<HTMLInputElement>(null)
	const inputId = useId()
	const status = submission?.status ?? 'draft'

	const answer = () => ({
		lessonId: props.lessonId,
		blockKey: props.blockKey,
		body: isEmptyDoc(body) ? null : body,
		fileIds: files.map((f) => f.id),
	})
	const apply = async (data: AssignmentState) => {
		qc.setQueryData(props.queryKey, data)
		// отправка без проверки сразу принимает работу и может завершить урок — обновляем статус урока и оглавление
		await qc.invalidateQueries({ queryKey: orpc.learn.key() })
	}
	const run = async (action: 'saveDraft' | 'submit') => {
		setBusy(true)
		setError(undefined)
		try {
			await apply(await client.assignment[action](answer()))
			toast.success(t(action === 'submit' ? 'assignment.sent' : 'assignment.saved'))
		} catch (e) {
			setError(t(errorText(e), { ns: 'errors' }))
		} finally {
			setBusy(false)
		}
	}
	const submit = () => {
		if (!window.confirm(t('assignment.confirmSubmit'))) return
		run('submit')
	}

	async function pick(list: FileList | null) {
		const file = list?.[0]
		if (!file) return
		setError(undefined)
		if (!(SUBMISSION_FILE.mime as readonly string[]).includes(file.type))
			return setError(t('FILE_TYPE_NOT_ALLOWED', { ns: 'errors' }))
		if (file.size > SUBMISSION_FILE.maxSize) return setError(t('FILE_TOO_LARGE', { ns: 'errors' }))
		setProgress(0)
		try {
			const id = await uploadFile(SUBMISSION_FILE.purpose, file, setProgress)
			setFiles((f) => [...f, { id, name: file.name, size: file.size }])
		} catch (e) {
			setError(t(errorText(e), { ns: 'errors' }))
		} finally {
			setProgress(null)
			if (input.current) input.current.value = ''
		}
	}

	return (
		<section
			className="grid gap-4 rounded-lg border p-4"
			data-testid="assignment-panel"
			aria-label={t('assignment.title')}
		>
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="flex items-center gap-2 font-medium">
					<FilePenLine className="size-4" aria-hidden />
					{t('assignment.title')}
				</h3>
				<Badge variant={TONE[status]} className="ml-auto" data-testid="assignment-status" data-status={status}>
					{submission ? t(`assignment.status.${status}`) : t('assignment.status.none')}
				</Badge>
			</div>
			<RichTextView doc={settings.prompt} resolveFile={(id) => props.state.promptFiles[id]?.url} />
			{!settings.requiresReview && <p className="text-muted-foreground text-xs">{t('assignment.noReviewHint')}</p>}

			{submission && submission.comments.length > 0 && (
				<div className="grid gap-2">
					<p className="font-medium text-sm">{t('assignment.reply.title')}</p>
					<CommentThread comments={submission.comments} testId="assignment-comments" />
				</div>
			)}
			{(status === 'submitted' || status === 'needs_revision') && (
				<CommentComposer
					testId="assignment-reply"
					sendLabel={t('assignment.reply.send')}
					onSend={async (v) => {
						await apply(await client.assignment.reply({ lessonId: props.lessonId, blockKey: props.blockKey, ...v }))
					}}
				/>
			)}

			{canEdit ? (
				<div className="grid gap-4">
					{status === 'needs_revision' && (
						<Alert>
							<AlertDescription data-testid="assignment-revision-hint">{t('assignment.revisionHint')}</AlertDescription>
						</Alert>
					)}
					{settings.allowText && (
						<div className="grid gap-1.5">
							<p className="font-medium text-sm">{t('assignment.yourAnswer')}</p>
							<RichTextEditor
								profile="comment"
								value={body}
								onChange={setBody}
								aria-label={t('assignment.yourAnswer')}
								testId="assignment-body"
							/>
						</div>
					)}
					{settings.allowFiles && (
						<div className="grid gap-2">
							<p className="font-medium text-sm">{t('assignment.files', { count: settings.maxFiles })}</p>
							{files.length > 0 && (
								<ul className="grid gap-1.5">
									{files.map((f) => (
										<li key={f.id} className="flex items-center gap-2 text-sm" data-testid="assignment-file">
											<Paperclip className="size-4 shrink-0" aria-hidden />
											<span className="min-w-0 flex-1 truncate">{f.name}</span>
											<span className="text-muted-foreground text-xs">{sizeText(f.size)}</span>
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
							<input
								ref={input}
								id={inputId}
								type="file"
								accept={SUBMISSION_FILE.mime.join(',')}
								className="sr-only"
								disabled={progress !== null || files.length >= settings.maxFiles}
								onChange={(e) => pick(e.target.files)}
								data-testid="assignment-file-input"
							/>
							<Button
								type="button"
								variant="outline"
								className="w-fit"
								disabled={progress !== null || files.length >= settings.maxFiles}
								onClick={() => input.current?.click()}
							>
								<Paperclip />
								{t('assignment.attach')}
							</Button>
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
						</div>
					)}
					{error && (
						<p role="alert" className="text-destructive text-sm" data-testid="assignment-error">
							{error}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={() => run('saveDraft')} disabled={busy} data-testid="assignment-save">
							{t('assignment.saveDraft')}
						</Button>
						<Button onClick={submit} disabled={busy || progress !== null} data-testid="assignment-submit">
							{t('assignment.submit')}
						</Button>
					</div>
				</div>
			) : (
				submission && (
					<div className="grid gap-3" data-testid="assignment-readonly">
						<p className="text-muted-foreground text-sm">
							{t(`assignment.readonly.${status === 'submitted' ? 'submitted' : status}`)}
						</p>
						{submission.body && !isEmptyDoc(submission.body) && (
							<div className="rounded-md border p-3">
								<RichTextView doc={submission.body} />
							</div>
						)}
						{submission.files.length > 0 && (
							<ul className="grid gap-1.5">
								{submission.files.map((f) => (
									<li key={f.id} className="flex items-center gap-2 text-sm">
										<Paperclip className="size-4 shrink-0" aria-hidden />
										<a href={f.url} className="min-w-0 flex-1 truncate underline" data-testid="assignment-file-link">
											{f.name}
										</a>
										<span className="text-muted-foreground text-xs">{sizeText(f.size)}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)
			)}
		</section>
	)
}
