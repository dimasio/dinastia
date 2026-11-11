// Вкладка «Аналитика» курса (карточка 4.6): сводка по ученикам, воронка по урокам (CSS-полосы, без библиотеки графиков),
// результаты тестов и заданий; фильтр по потоку. Куратор видит только свои потоки (сервер).
import type { CourseResults } from '@dinastia/contracts/assessments'
import { type CourseAnalytics, GROUP_NONE } from '@dinastia/contracts/learning'
import {
	Card,
	CardContent,
	cn,
	EmptyState,
	PageHeader,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
} from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { CourseTabs } from '../courses/course-tabs.tsx'

const ALL = '__all'
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

export function Analytics(props: { courseId: string; groupId?: string | undefined; onGroup: (g?: string) => void }) {
	const { courseId, groupId } = props
	const { t } = useTranslation(['learning', 'errors'])
	const input = { courseId, ...(groupId ? { groupId } : {}) }
	const groups = useQuery(orpc.learning.groups.list.queryOptions({ input: { courseId } }))
	const analytics = useQuery(orpc.learning.analytics.course.queryOptions({ input }))
	const results = useQuery(orpc.assessments.results.course.queryOptions({ input }))
	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="analytics">
			<CourseTabs courseId={courseId} active="analytics" />
			<PageHeader
				title={t('analytics.title')}
				description={t('analytics.description')}
				actions={
					(groups.data?.length ?? 0) > 0 ? (
						<Select value={groupId ?? ALL} onValueChange={(v) => props.onGroup(v === ALL ? undefined : v)}>
							<SelectTrigger className="w-full sm:w-56" aria-label={t('analytics.group')} data-testid="analytics-group">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL}>{t('analytics.allGroups')}</SelectItem>
								{groups.data?.map((g) => (
									<SelectItem key={g.id} value={g.id}>
										{g.title}
									</SelectItem>
								))}
								<SelectItem value={GROUP_NONE}>{t('analytics.noGroup')}</SelectItem>
							</SelectContent>
						</Select>
					) : undefined
				}
			/>
			{analytics.isPending ? (
				<Skeleton className="h-64 w-full" />
			) : analytics.error ? (
				<EmptyState icon={ChartColumn} title={t(errorText(analytics.error), { ns: 'errors' })} />
			) : analytics.data.summary.learners === 0 ? (
				<EmptyState
					icon={ChartColumn}
					title={t('analytics.emptyTitle')}
					description={t('analytics.emptyDescription')}
				/>
			) : (
				<>
					<Summary data={analytics.data} />
					<Funnel data={analytics.data} />
					{results.data && <Results data={results.data} />}
				</>
			)}
		</div>
	)
}

function Summary({ data: { summary: s } }: { data: CourseAnalytics }) {
	const { t } = useTranslation('learning')
	const cards = [
		{ key: 'learners', value: s.learners },
		{ key: 'learning', value: s.learning },
		{ key: 'completed', value: s.completed },
		{ key: 'expired', value: s.expired },
		{ key: 'avgProgress', value: `${s.avgProgressPct}%` },
		{ key: 'withOverdue', value: s.withOverdue, alert: s.withOverdue > 0 },
	] as const
	return (
		<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="analytics-summary">
			{cards.map((c) => (
				<li key={c.key}>
					<Card className="h-full py-3">
						<CardContent className="grid gap-1 px-4">
							<span className="text-muted-foreground text-xs">{t(`analytics.summary.${c.key}`)}</span>
							<span
								className={cn('font-semibold text-2xl tabular-nums', 'alert' in c && c.alert && 'text-destructive')}
								data-testid={`analytics-${c.key}`}
							>
								{c.value}
							</span>
						</CardContent>
					</Card>
				</li>
			))}
		</ul>
	)
}

function Funnel({ data }: { data: CourseAnalytics }) {
	const { t } = useTranslation('learning')
	const base = data.summary.learners
	return (
		<section aria-labelledby="analytics-funnel">
			<h2 id="analytics-funnel" className="mb-1 font-medium">
				{t('analytics.funnel.title')}
			</h2>
			<p className="mb-3 text-muted-foreground text-sm">{t('analytics.funnel.hint')}</p>
			<div className="mb-3 flex flex-wrap gap-4 text-muted-foreground text-xs" aria-hidden>
				<span className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-sm bg-primary/30" />
					{t('analytics.funnel.opened')}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-sm bg-primary" />
					{t('analytics.funnel.completed')}
				</span>
			</div>
			<ol className="grid gap-3" data-testid="analytics-funnel">
				{data.lessons.map((l, i) => (
					<li key={l.lessonId} className="grid gap-1" data-testid="analytics-lesson">
						<div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
							<span className="min-w-0 truncate">
								<span className="text-muted-foreground tabular-nums">{i + 1}. </span>
								{l.title}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{t('analytics.funnel.counts', {
									opened: l.opened,
									completed: l.completed,
									pct: pct(l.completed, base),
								})}
								{l.overdue > 0 && (
									<span className="font-medium text-destructive">
										{' · '}
										{t('analytics.funnel.overdue', { count: l.overdue })}
									</span>
								)}
							</span>
						</div>
						<div
							className="relative h-2 overflow-hidden rounded-full bg-muted"
							role="img"
							aria-label={t('analytics.funnel.bar', {
								opened: pct(l.opened, base),
								completed: pct(l.completed, base),
							})}
						>
							<div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${pct(l.opened, base)}%` }} />
							<div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct(l.completed, base)}%` }} />
						</div>
					</li>
				))}
			</ol>
		</section>
	)
}

const TH = 'px-3 py-2 text-left font-medium text-muted-foreground text-xs'
const TD = 'px-3 py-2 tabular-nums'

function Results({ data }: { data: CourseResults }) {
	const { t } = useTranslation('learning')
	if (!data.quizzes.length && !data.assignments.length) return null
	return (
		<>
			{data.quizzes.length > 0 && (
				<section aria-labelledby="analytics-quizzes">
					<h2 id="analytics-quizzes" className="mb-3 font-medium">
						{t('analytics.quizzes.title')}
					</h2>
					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full text-sm" data-testid="analytics-quizzes">
							<thead className="border-b">
								<tr>
									<th className={TH}>{t('analytics.quizzes.lesson')}</th>
									<th className={TH}>{t('analytics.quizzes.students')}</th>
									<th className={TH}>{t('analytics.quizzes.passed')}</th>
									<th className={TH}>{t('analytics.quizzes.avgBest')}</th>
									<th className={TH}>{t('analytics.quizzes.avgAttempts')}</th>
									<th className={TH}>{t('analytics.quizzes.pending')}</th>
								</tr>
							</thead>
							<tbody>
								{data.quizzes.map((q) => (
									<tr key={`${q.lessonId}:${q.blockKey}`} className="border-b last:border-0">
										<td className="px-3 py-2">{q.lessonTitle}</td>
										<td className={TD}>{q.students}</td>
										<td className={TD}>
											{q.passed} ({pct(q.passed, q.students)}%)
										</td>
										<td className={TD}>{q.avgBestPct === null ? '—' : `${q.avgBestPct}%`}</td>
										<td className={TD}>{q.avgAttempts.toLocaleString('ru-RU')}</td>
										<td className={TD}>{q.pendingReview || '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}
			{data.assignments.length > 0 && (
				<section aria-labelledby="analytics-assignments">
					<h2 id="analytics-assignments" className="mb-3 font-medium">
						{t('analytics.assignments.title')}
					</h2>
					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full text-sm" data-testid="analytics-assignments">
							<thead className="border-b">
								<tr>
									<th className={TH}>{t('analytics.assignments.lesson')}</th>
									<th className={TH}>{t('analytics.assignments.submitted')}</th>
									<th className={TH}>{t('analytics.assignments.accepted')}</th>
									<th className={TH}>{t('analytics.assignments.needsRevision')}</th>
									<th className={TH}>{t('analytics.assignments.rejected')}</th>
									<th className={TH}>{t('analytics.assignments.pending')}</th>
								</tr>
							</thead>
							<tbody>
								{data.assignments.map((a) => (
									<tr key={`${a.lessonId}:${a.blockKey}`} className="border-b last:border-0">
										<td className="px-3 py-2">{a.lessonTitle}</td>
										<td className={TD}>{a.submitted}</td>
										<td className={TD}>{a.accepted}</td>
										<td className={TD}>{a.needsRevision}</td>
										<td className={TD}>{a.rejected}</td>
										<td className={TD}>{a.pending}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}
		</>
	)
}
