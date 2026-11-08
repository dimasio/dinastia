// Экран проверки попытки теста (карточка 3.6): ответы на вопросы с ручной проверкой (`open_text`) — баллы и комментарий для
// каждого; автопроверенные вопросы — справкой. Когда оценены все ручные вопросы, попытка получает итог и «сдал / не сдал».
import type { AttemptReview } from '@dinastia/contracts/assessments'
import { emptyDoc, isEmptyDoc } from '@dinastia/contracts/common'
import { QuestionViewerHost } from '@dinastia/questions/client'
import { Alert, AlertDescription, Badge, Button, EmptyState, Input, Skeleton, toast } from '@dinastia/ui'
import { RichTextEditor, RichTextView } from '@dinastia/ui/rich-text'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { client, orpc } from '#/app/orpc.ts'

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

export function AttemptReviewScreen({ attemptId }: { attemptId: string }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const query = orpc.review.attempt.queryOptions({ input: { attemptId } })
	const detail = useQuery({ ...query, staleTime: Number.POSITIVE_INFINITY })
	const back = (
		<Link
			to="/admin/review"
			search={{}}
			className="mb-4 flex w-fit items-center gap-1 text-muted-foreground text-sm hover:underline"
			data-testid="attempt-back"
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
	return (
		<>
			{back}
			<Grading
				key={`${detail.data.attempt.status}:${detail.data.attempt.score}`}
				data={detail.data}
				attemptId={attemptId}
				queryKey={query.queryKey}
			/>
		</>
	)
}

function Grading({
	data,
	attemptId,
	queryKey,
}: {
	data: AttemptReview
	attemptId: string
	queryKey: readonly unknown[]
}) {
	const { t } = useTranslation(['assessments', 'errors'])
	const qc = useQueryClient()
	const open = data.attempt.status === 'submitted'
	const manual = data.questions.filter((q) => q.manual)
	// ввод: баллы (строкой — «2,5» и «2.5») и комментарий по вопросам; уже поставленные оценки подставляются
	const [scores, setScores] = useState<Record<string, string>>(() =>
		Object.fromEntries(manual.map((q) => [q.id, q.score === null ? '' : String(q.score).replace('.', ',')])),
	)
	const [feedback, setFeedback] = useState<Record<string, ReturnType<typeof emptyDoc>>>(() =>
		Object.fromEntries(manual.map((q) => [q.id, (q.feedback as ReturnType<typeof emptyDoc> | null) ?? emptyDoc()])),
	)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string>()
	const parse = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(',', '.')))

	async function save() {
		setError(undefined)
		const grades = manual.flatMap((q) => {
			const score = parse(scores[q.id] ?? '')
			if (score === null || Number.isNaN(score)) return []
			const fb = feedback[q.id]
			return [{ attemptQuestionId: q.id, score, feedback: fb && !isEmptyDoc(fb) ? fb : null }]
		})
		if (grades.length === 0) return setError(t('grading.nothing'))
		setBusy(true)
		try {
			const next = await client.review.gradeAttempt({ attemptId, grades })
			qc.setQueryData(queryKey, next)
			qc.invalidateQueries({ queryKey: ['resource', 'review'] })
			toast.success(next.attempt.status === 'graded' ? t('grading.done') : t('grading.saved'))
		} catch (e) {
			setError(t(errorText(e), { ns: 'errors' }))
		} finally {
			setBusy(false)
		}
	}

	const a = data.attempt
	const verdict = a.status === 'submitted' ? 'pending' : a.passed ? 'passed' : 'failed'
	return (
		<div data-testid="attempt-review">
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<div className="min-w-0">
					<h1 className="font-semibold text-xl tracking-tight" data-testid="attempt-student">
						{data.student.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						{data.course.title} · {data.lesson.title} · {data.student.email}
					</p>
				</div>
				<Badge
					variant={verdict === 'passed' ? 'default' : verdict === 'failed' ? 'destructive' : 'secondary'}
					className="ml-auto"
					data-testid="attempt-verdict"
					data-verdict={verdict}
				>
					{t(`quiz.verdict.${verdict}`)}
				</Badge>
				<span className="text-sm tabular-nums" data-testid="attempt-score">
					{fmt(a.score)} / {a.maxScore}
				</span>
			</div>
			<p className="mb-4 text-muted-foreground text-sm">
				{t('grading.summary', { auto: fmt(data.autoScore), manual: data.manualMax, pass: data.passScorePct })}
			</p>

			<ol className="grid gap-6">
				{data.questions.map((q, i) => (
					<li
						key={q.id}
						className="grid gap-3 rounded-lg border p-4"
						data-testid="attempt-question"
						data-manual={q.manual || undefined}
					>
						<p className="text-muted-foreground text-xs">
							{t('quiz.questionN', { n: i + 1, total: data.questions.length })} ·{' '}
							{q.manual ? t('grading.manual') : t('grading.auto')}
						</p>
						{q.manual ? (
							<ManualQuestion
								q={q}
								open={open}
								score={scores[q.id] ?? ''}
								onScore={(v) => setScores((s) => ({ ...s, [q.id]: v }))}
								feedback={feedback[q.id] ?? emptyDoc()}
								onFeedback={(v) => setFeedback((f) => ({ ...f, [q.id]: v }))}
								testId={`attempt-q-${i}`}
							/>
						) : (
							<>
								<QuestionViewerHost type={q.type} data={q.data} response={q.response} testId={`attempt-view-${i}`} />
								<p className="text-sm" data-testid={`attempt-auto-score-${i}`}>
									{t('quiz.earned', { score: fmt(q.score ?? 0), max: q.points })}
								</p>
							</>
						)}
					</li>
				))}
			</ol>

			{error && (
				<Alert variant="destructive" className="mt-4">
					<AlertDescription data-testid="attempt-error">{error}</AlertDescription>
				</Alert>
			)}
			{open ? (
				<div className="mt-6 flex flex-wrap items-center gap-3">
					<Button onClick={save} disabled={busy} data-testid="attempt-save">
						{t('grading.save')}
					</Button>
					<p className="text-muted-foreground text-xs">{t('grading.hint')}</p>
				</div>
			) : (
				<Alert className="mt-6">
					<AlertDescription data-testid="attempt-final">{t('grading.final')}</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

function ManualQuestion(props: {
	q: AttemptReview['questions'][number]
	open: boolean
	score: string
	onScore: (v: string) => void
	feedback: ReturnType<typeof emptyDoc>
	onFeedback: (v: ReturnType<typeof emptyDoc>) => void
	testId: string
}) {
	const { t } = useTranslation('assessments')
	const prompt = (props.q.data as { prompt: ReturnType<typeof emptyDoc> }).prompt
	const text = (props.q.response as { text?: string } | null)?.text
	return (
		<div className="grid gap-3">
			<RichTextView doc={prompt} />
			<div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid={`${props.testId}-answer`}>
				<p className="mb-1 font-medium">{t('grading.studentAnswer')}</p>
				{text ? (
					<p className="whitespace-pre-wrap">{text}</p>
				) : (
					<p className="text-muted-foreground">{t('grading.noAnswer')}</p>
				)}
			</div>
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1 text-sm">
					<span className="font-medium">{t('grading.score', { max: props.q.points })}</span>
					<Input
						value={props.score}
						aria-label={t('grading.score', { max: props.q.points })}
						inputMode="decimal"
						className="w-28"
						disabled={!props.open}
						onChange={(e) => props.onScore(e.target.value)}
						data-testid={`${props.testId}-score`}
					/>
				</div>
			</div>
			<div className="grid gap-1">
				<p className="font-medium text-sm">{t('grading.feedback')}</p>
				<RichTextEditor
					profile="comment"
					value={props.feedback}
					onChange={props.onFeedback}
					aria-label={t('grading.feedback')}
					{...(props.open ? {} : { disabled: true })}
					testId={`${props.testId}-feedback`}
				/>
			</div>
		</div>
	)
}
