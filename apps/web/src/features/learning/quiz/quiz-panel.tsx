// Панель теста в плеере ученика (карточка 3.3): карточка с настройками и попытками → прохождение (ответы сохраняются
// сразу, таймер по серверному сроку) → результат и разбор по правилу показа ответов. Всё решает сервер (`quiz.*`).
import type { AttemptResult, AttemptSummary, AttemptView, QuizState } from '@dinastia/contracts/assessments'
import { QuestionViewerHost } from '@dinastia/questions/client'
import { Alert, AlertDescription, Badge, Button, Skeleton, toast } from '@dinastia/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Clock, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorCode, errorText } from '#/app/errors.ts'
import { client, orpc } from '#/app/orpc.ts'

type Mode = { kind: 'idle' } | { kind: 'attempt'; id: string } | { kind: 'result'; result: AttemptResult }

export function QuizPanel({ lessonId, blockKey }: { lessonId: string; blockKey: string }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const qc = useQueryClient()
	const stateQuery = orpc.quiz.get.queryOptions({ input: { lessonId, blockKey } })
	const state = useQuery(stateQuery)
	const [mode, setMode] = useState<Mode>({ kind: 'idle' })
	const [busy, setBusy] = useState(false)
	const refresh = () => qc.invalidateQueries({ queryKey: stateQuery.queryKey })

	const start = async () => {
		setBusy(true)
		try {
			const view = await client.quiz.start({ lessonId, blockKey })
			setMode({ kind: 'attempt', id: view.attempt.id })
			await refresh()
		} catch (e) {
			toast.error(t(errorText(e), { ns: 'errors' }))
			await refresh()
		} finally {
			setBusy(false)
		}
	}
	const openResult = async (attemptId: string) => {
		try {
			setMode({ kind: 'result', result: await client.quiz.result({ attemptId }) })
		} catch (e) {
			toast.error(t(errorText(e), { ns: 'errors' }))
		}
	}

	if (state.isPending) return <Skeleton className="h-32 w-full" />
	if (state.error)
		return (
			<Alert variant="destructive">
				<AlertDescription>{t(errorText(state.error), { ns: 'errors' })}</AlertDescription>
			</Alert>
		)
	const s = state.data

	if (mode.kind === 'attempt')
		return (
			<AttemptScreen
				attemptId={mode.id}
				onDone={async (result) => {
					setMode({ kind: 'result', result })
					await refresh()
				}}
			/>
		)
	if (mode.kind === 'result')
		return (
			<ResultScreen
				result={mode.result}
				canRetry={s.canStart}
				onRetry={start}
				onClose={() => {
					setMode({ kind: 'idle' })
					refresh()
				}}
			/>
		)
	return <Summary state={s} busy={busy} onStart={start} onOpenResult={openResult} />
}

const pctOf = (a: { score: number; maxScore: number }) =>
	a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

function verdictKey(a: AttemptSummary) {
	return a.status === 'in_progress' ? 'active' : a.status === 'submitted' ? 'pending' : a.passed ? 'passed' : 'failed'
}

function Summary(props: { state: QuizState; busy: boolean; onStart: () => void; onOpenResult: (id: string) => void }) {
	const { t } = useTranslation('assessments')
	const { settings: s, attempts, best } = props.state
	const used = attempts.length
	return (
		<section className="grid gap-4 rounded-lg border p-4" data-testid="quiz-panel" aria-label={t('quiz.title')}>
			<h3 className="flex items-center gap-2 font-medium">
				<ClipboardCheck className="size-4" aria-hidden />
				{t('quiz.title')}
			</h3>
			<ul className="flex flex-wrap gap-2 text-sm">
				<li>
					<Badge variant="secondary">{t('quiz.facts.questions', { count: s.questionsCount })}</Badge>
				</li>
				<li>
					<Badge variant="secondary">{t('quiz.facts.pass', { pct: s.passScorePct })}</Badge>
				</li>
				<li>
					<Badge variant="secondary">
						{s.timeLimitSec === null
							? t('quiz.facts.noTime')
							: t('quiz.facts.time', { minutes: Math.round(s.timeLimitSec / 60) })}
					</Badge>
				</li>
				<li>
					<Badge variant="secondary" data-testid="quiz-attempts-used">
						{s.attemptsLimit === 0
							? t('quiz.facts.attemptsUnlimited', { used })
							: t('quiz.facts.attemptsOf', { used, limit: s.attemptsLimit })}
					</Badge>
				</li>
			</ul>
			{best && (
				<p className="text-sm" data-testid="quiz-best">
					{t('quiz.best', { score: fmt(best.score), max: best.maxScore, pct: pctOf(best) })}
				</p>
			)}
			{attempts.length > 0 && (
				<ul className="grid gap-1 text-sm" data-testid="quiz-attempts">
					{attempts.map((a, i) => (
						<li
							key={a.id}
							className="flex flex-wrap items-center gap-2"
							data-testid="quiz-attempt"
							data-status={a.status}
						>
							<span className="text-muted-foreground">{t('quiz.attemptN', { n: attempts.length - i })}</span>
							<span>{t(`quiz.verdict.${verdictKey(a)}`)}</span>
							{a.status !== 'in_progress' && (
								<span className="tabular-nums">
									{fmt(a.score)} / {a.maxScore}
								</span>
							)}
							{a.status !== 'in_progress' && (
								<Button
									variant="link"
									size="sm"
									className="h-auto p-0"
									onClick={() => props.onOpenResult(a.id)}
									data-testid="quiz-open-result"
								>
									{t('quiz.result')}
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			<div>
				{props.state.activeAttemptId ? (
					<Button onClick={props.onStart} disabled={props.busy} data-testid="quiz-continue">
						{t('quiz.continue')}
					</Button>
				) : props.state.canStart ? (
					<Button onClick={props.onStart} disabled={props.busy} data-testid="quiz-start">
						{t('quiz.start')}
					</Button>
				) : (
					<p className="text-muted-foreground text-sm" data-testid="quiz-exhausted">
						{t('quiz.exhausted')}
					</p>
				)}
			</div>
		</section>
	)
}

/** Оставшееся время по серверному сроку; на каждой секунде пересчитывается от часов клиента с поправкой на сервер. */
function useRemaining(deadline: Date | null, offsetMs: number) {
	const [now, setNow] = useState(() => Date.now() + offsetMs)
	useEffect(() => {
		if (!deadline) return
		const id = setInterval(() => setNow(Date.now() + offsetMs), 1000)
		return () => clearInterval(id)
	}, [deadline, offsetMs])
	return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

function AttemptScreen({
	attemptId,
	onDone,
}: {
	attemptId: string
	onDone: (r: AttemptResult) => void | Promise<void>
}) {
	const { t } = useTranslation(['assessments', 'errors'])
	const view = useQuery({
		...orpc.quiz.attempt.queryOptions({ input: { attemptId } }),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
	})
	if (view.isPending) return <Skeleton className="h-48 w-full" />
	if (view.error)
		return (
			<Alert variant="destructive">
				<AlertDescription>{t(errorText(view.error), { ns: 'errors' })}</AlertDescription>
			</Alert>
		)
	// просроченная попытка уже сдана сервером — показываем результат
	if (view.data.attempt.status !== 'in_progress') return <FinishedRedirect attemptId={attemptId} onDone={onDone} />
	return <Attempt view={view.data} onDone={onDone} />
}

function FinishedRedirect({
	attemptId,
	onDone,
}: {
	attemptId: string
	onDone: (r: AttemptResult) => void | Promise<void>
}) {
	useEffect(() => {
		client.quiz.result({ attemptId }).then(onDone)
	}, [attemptId, onDone])
	return <Skeleton className="h-32 w-full" />
}

function Attempt({ view, onDone }: { view: AttemptView; onDone: (r: AttemptResult) => void | Promise<void> }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const attemptId = view.attempt.id
	const [responses, setResponses] = useState<Record<string, unknown>>(() =>
		Object.fromEntries(view.questions.flatMap((q) => (q.response !== null ? [[q.id, q.response]] : []))),
	)
	const dirty = useRef(new Map<string, unknown>())
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	const [submitting, setSubmitting] = useState(false)
	const [saveError, setSaveError] = useState(false)
	// поправка часов: разница между часами клиента и сервера неизвестна — берём срок как есть; ошибка > секунд не критична
	const remaining = useRemaining(view.attempt.deadlineAt, 0)

	const save = useCallback(
		async (qid: string) => {
			const response = dirty.current.get(qid)
			dirty.current.delete(qid)
			try {
				await client.quiz.answer({ attemptId, attemptQuestionId: qid, response: response ?? null })
				setSaveError(false)
			} catch (e) {
				if (errorCode(e) !== 'ATTEMPT_EXPIRED') setSaveError(true)
				throw e
			}
		},
		[attemptId],
	)

	const flush = useCallback(async () => {
		for (const [qid, timer] of timers.current) {
			clearTimeout(timer)
			timers.current.delete(qid)
		}
		for (const qid of [...dirty.current.keys()]) await save(qid)
	}, [save])

	const submit = useCallback(async () => {
		setSubmitting(true)
		try {
			await flush().catch(() => undefined) // не сохранилось (срок) — сервер оценит то, что есть
			await onDone(await client.quiz.submit({ attemptId }))
		} catch (e) {
			toast.error(t(errorText(e), { ns: 'errors' }))
			setSubmitting(false)
		}
	}, [attemptId, flush, onDone, t])

	// время вышло — сдаём
	const auto = useRef(false)
	useEffect(() => {
		if (remaining === 0 && !auto.current) {
			auto.current = true
			submit()
		}
	}, [remaining, submit])

	useEffect(
		() => () => {
			for (const timer of timers.current.values()) clearTimeout(timer)
		},
		[],
	)

	const change = (qid: string, response: unknown) => {
		setResponses((r) => ({ ...r, [qid]: response }))
		dirty.current.set(qid, response)
		clearTimeout(timers.current.get(qid))
		timers.current.set(
			qid,
			setTimeout(() => {
				timers.current.delete(qid)
				save(qid).catch(() => undefined)
			}, 400),
		)
	}

	const answered = view.questions.filter((q) => responses[q.id] !== undefined && responses[q.id] !== null).length
	const confirmSubmit = () => {
		const left = view.questions.length - answered
		if (left > 0 && !window.confirm(t('quiz.confirmUnanswered', { count: left }))) return
		submit()
	}

	return (
		<section className="grid gap-5" data-testid="quiz-attempt-screen" aria-label={t('quiz.title')}>
			<div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background py-2">
				<p className="text-sm" data-testid="quiz-answered">
					{t('quiz.answered', { done: answered, total: view.questions.length })}
				</p>
				{remaining !== null && (
					<p
						className="ml-auto flex items-center gap-1.5 font-medium text-sm tabular-nums"
						role="timer"
						aria-label={t('quiz.timeLeft')}
						data-testid="quiz-timer"
						data-seconds={remaining}
					>
						<Clock className="size-4" aria-hidden />
						{clock(remaining)}
					</p>
				)}
			</div>
			{saveError && (
				<Alert variant="destructive">
					<TriangleAlert className="size-4" />
					<AlertDescription data-testid="quiz-save-error">{t('quiz.saveError')}</AlertDescription>
				</Alert>
			)}
			<ol className="grid gap-6">
				{view.questions.map((q, i) => (
					<li key={q.id} className="grid gap-2 rounded-lg border p-4" data-testid="quiz-question">
						<p className="text-muted-foreground text-xs">
							{t('quiz.questionN', { n: i + 1, total: view.questions.length })} ·{' '}
							{t('quiz.points', { count: q.points })}
						</p>
						<QuestionViewerHost
							type={q.type}
							data={q.data}
							response={responses[q.id] ?? null}
							onChange={(r) => change(q.id, r)}
							testId={`quiz-q-${i}`}
						/>
					</li>
				))}
			</ol>
			<div className="flex justify-end">
				<Button onClick={confirmSubmit} disabled={submitting} data-testid="quiz-submit">
					{t('quiz.submit')}
				</Button>
			</div>
		</section>
	)
}

function ResultScreen(props: { result: AttemptResult; canRetry: boolean; onRetry: () => void; onClose: () => void }) {
	const { t } = useTranslation('assessments')
	const { attempt, pct, revealed, questions } = props.result
	const key = verdictKey(attempt)
	return (
		<section className="grid gap-5" data-testid="quiz-result" aria-label={t('quiz.result')}>
			<div className="grid gap-1 rounded-lg border p-4">
				<p className="flex flex-wrap items-center gap-3">
					<Badge
						variant={key === 'passed' ? 'default' : key === 'failed' ? 'destructive' : 'secondary'}
						data-testid="quiz-verdict"
						data-verdict={key}
					>
						{t(`quiz.verdict.${key}`)}
					</Badge>
					<span className="font-medium tabular-nums" data-testid="quiz-score">
						{t('quiz.scoreLine', { score: fmt(attempt.score), max: attempt.maxScore, pct })}
					</span>
				</p>
				{key === 'pending' && <p className="text-muted-foreground text-sm">{t('quiz.pendingHint')}</p>}
				{!revealed && key !== 'pending' && <p className="text-muted-foreground text-sm">{t('quiz.hiddenHint')}</p>}
			</div>
			{revealed && (
				<ol className="grid gap-6">
					{questions.map((q, i) => (
						<li
							key={q.id}
							className="grid gap-2 rounded-lg border p-4"
							data-testid="quiz-result-question"
							data-correct={q.isCorrect ?? undefined}
						>
							<p className="text-muted-foreground text-xs">
								{t('quiz.questionN', { n: i + 1, total: questions.length })} ·{' '}
								{q.score === null ? t('quiz.notGraded') : t('quiz.earned', { score: fmt(q.score), max: q.points })}
							</p>
							<QuestionViewerHost
								type={q.type}
								data={q.data}
								response={q.response}
								review={q.review}
								testId={`quiz-r-${i}`}
							/>
						</li>
					))}
				</ol>
			)}
			<div className="flex flex-wrap gap-2">
				{props.canRetry && (
					<Button onClick={props.onRetry} data-testid="quiz-again">
						{t('quiz.again')}
					</Button>
				)}
				<Button variant="outline" onClick={props.onClose} data-testid="quiz-close">
					{t('quiz.close')}
				</Button>
			</div>
		</section>
	)
}
