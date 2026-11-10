// Экран проверки работы (карточка 3.5): ответ ученика, переписка, решение. Слева ответ, справа переписка; на телефоне —
// одна колонка в этом порядке. Работа в конечном статусе — переписка только на чтение у ученика, проверяющий может писать.
import type { ReviewDetail } from '@dinastia/contracts/assessments'
import { isEmptyDoc } from '@dinastia/contracts/common'
import { Alert, AlertDescription, Badge, EmptyState, Skeleton, toast } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ClipboardCheck, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { client, orpc } from '#/app/orpc.ts'
import { CommentComposer, CommentThread } from '../comments.tsx'

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

export function ReviewScreen({ submissionId }: { submissionId: string }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const qc = useQueryClient()
	const query = orpc.review.get.queryOptions({ input: { submissionId } })
	const detail = useQuery(query)
	const back = (
		<Link
			to="/admin/review"
			search={{}}
			className="mb-4 flex w-fit items-center gap-1 text-muted-foreground text-sm hover:underline"
			data-testid="review-back"
		>
			<ArrowLeft className="size-4" aria-hidden />
			{t('review.back')}
		</Link>
	)
	if (detail.isPending) return <Skeleton className="h-64 w-full" />
	if (detail.error)
		return (
			<>
				{back}
				<EmptyState icon={ClipboardCheck} title={t(errorText(detail.error), { ns: 'errors' })} />
			</>
		)
	const d: ReviewDetail = detail.data
	const s = d.submission
	const final = s.status === 'accepted' || s.status === 'rejected'
	const refresh = async (next?: ReviewDetail) => {
		if (next) qc.setQueryData(query.queryKey, next)
		else await qc.invalidateQueries({ queryKey: query.queryKey })
		qc.invalidateQueries({ queryKey: ['resource', 'review'] })
	}
	const decide =
		(decision: 'accept' | 'needs_revision' | 'reject' | 'allow_resubmit') =>
		async (v: { body: ReviewDetail['prompt']; fileIds: string[] }) => {
			await client.assignment.review({ submissionId, decision, comment: v.body, fileIds: v.fileIds })
			toast.success(t(`review.decided.${decision}`))
			await refresh()
		}

	return (
		<div data-testid="review-screen">
			{back}
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<div className="min-w-0">
					<h1 className="font-semibold text-xl tracking-tight" data-testid="review-student">
						{d.student.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						{d.course.title} · {d.lesson.title} · {d.student.email}
					</p>
				</div>
				<Badge variant={TONE[s.status]} className="ml-auto" data-testid="review-status" data-status={s.status}>
					{t(`assignment.status.${s.status}`)}
				</Badge>
				<span className="text-muted-foreground text-sm" data-testid="review-revision">
					{t('review.revision', { n: s.revision })}
				</span>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="grid content-start gap-4" aria-label={t('review.answer')}>
					{d.prompt && (
						<div className="rounded-md bg-muted p-3 text-sm">
							<p className="mb-1 font-medium">{t('review.prompt')}</p>
							<RichTextView doc={d.prompt} resolveFile={(id) => d.promptFiles[id]?.url} />
						</div>
					)}
					<h2 className="font-medium">{t('review.answer')}</h2>
					<div className="rounded-lg border p-4" data-testid="review-answer">
						{s.body && !isEmptyDoc(s.body) ? (
							<RichTextView doc={s.body} />
						) : (
							<p className="text-muted-foreground text-sm">{t('review.noText')}</p>
						)}
						{s.files.length > 0 && (
							<ul className="mt-3 grid gap-1.5">
								{s.files.map((f) => (
									<li key={f.id} className="flex items-center gap-2 text-sm">
										<Paperclip className="size-4 shrink-0" aria-hidden />
										<a href={f.url} className="min-w-0 flex-1 truncate underline" data-testid="review-file">
											{f.name}
										</a>
										<span className="text-muted-foreground text-xs">{sizeText(f.size)}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				<section className="grid content-start gap-4" aria-label={t('review.thread')}>
					<h2 className="font-medium">{t('review.thread')}</h2>
					<CommentThread comments={s.comments} testId="review-comments" />
					<CommentComposer
						testId="review-composer"
						sendLabel={t('review.send')}
						onSend={async (v) => {
							await refresh(await client.review.comment({ submissionId, body: v.body, fileIds: v.fileIds }))
						}}
						decisions={
							s.status === 'accepted'
								? []
								: s.status === 'submitted'
									? [
											{ key: 'accept', label: t('review.accept'), run: decide('accept') },
											{
												key: 'needs-revision',
												label: t('review.needsRevision'),
												variant: 'outline',
												run: decide('needs_revision'),
											},
											{ key: 'reject', label: t('review.reject'), variant: 'destructive', run: decide('reject') },
										]
									: s.status === 'rejected'
										? [
												{
													key: 'allow-resubmit',
													label: t('review.allowResubmit'),
													variant: 'outline',
													run: decide('allow_resubmit'),
												},
											]
										: []
						}
					>
						{!final && s.status === 'submitted' && (
							<p className="text-muted-foreground text-xs">{t('review.decisionHint')}</p>
						)}
						{s.status === 'needs_revision' && (
							<Alert>
								<AlertDescription>{t('review.waitingStudent')}</AlertDescription>
							</Alert>
						)}
						{final && (
							<Alert>
								<AlertDescription data-testid="review-final">
									{t(`review.final.${s.status as 'accepted' | 'rejected'}`)}
								</AlertDescription>
							</Alert>
						)}
					</CommentComposer>
				</section>
			</div>
		</div>
	)
}
