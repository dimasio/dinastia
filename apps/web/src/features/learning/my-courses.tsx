// Кабинет ученика (карточки 2.6, 4.5): «Продолжить обучение», «Ближайшие сроки», «На доработке» и «Мои курсы» по вкладкам
// «Учусь» / «Пройденные» / «Доступ закончился». Пустые блоки и вкладки не показываются. У пройденного — «Скачать сертификат» (4.7).
import type { MyRevision } from '@dinastia/contracts/assessments'
import type { HomeDeadline, LearnHome, MyCourse } from '@dinastia/contracts/learning'
import { Button, Card, CardContent, cn, EmptyState, PageHeader, Skeleton } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { GraduationCap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { MyCertificate } from '../certificates/my-certificate.tsx'
import { useDueText } from './lesson-list.tsx'
import { ProgressBar } from './progress-bar.tsx'

const TABS = ['learning', 'completed', 'closed'] as const
type Tab = (typeof TABS)[number]
const tabOf = (c: MyCourse): Tab => (c.expired || c.revoked ? 'closed' : c.completedAt ? 'completed' : 'learning')

const TAB =
	'rounded px-3 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
const ROW =
	'flex flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-row sm:items-baseline sm:gap-3'

export function MyCourses() {
	const { t } = useTranslation(['learning', 'errors'])
	const courses = useQuery(orpc.learn.courses.list.queryOptions())
	const home = useQuery(orpc.learn.home.get.queryOptions())
	const revisions = useQuery(orpc.assignment.revisions.queryOptions())
	return (
		<>
			<PageHeader title={t('my.title')} />
			{courses.isPending ? (
				<Skeleton className="h-40 w-full" />
			) : courses.error ? (
				<EmptyState icon={GraduationCap} title={t(errorText(courses.error), { ns: 'errors' })} />
			) : courses.data.length === 0 ? (
				<EmptyState icon={GraduationCap} title={t('my.emptyTitle')} description={t('my.emptyDescription')} />
			) : (
				<div className="grid gap-8">
					{home.data?.continue && <ContinueCard item={home.data.continue} />}
					{home.data && home.data.deadlines.length > 0 && <Deadlines items={home.data.deadlines} />}
					{revisions.data && revisions.data.length > 0 && <Revisions items={revisions.data} />}
					<CourseTabs courses={courses.data} />
				</div>
			)}
		</>
	)
}

function ContinueCard({ item }: { item: NonNullable<LearnHome['continue']> }) {
	const { t } = useTranslation('learning')
	return (
		<section aria-labelledby="home-continue">
			<h2 id="home-continue" className="mb-3 font-medium">
				{t('home.continueTitle')}
			</h2>
			<Card className="overflow-hidden py-0" data-testid="home-continue">
				<div className="flex flex-col sm:flex-row">
					<div className="aspect-video bg-muted sm:aspect-auto sm:w-48 sm:shrink-0">
						{item.coverUrl && <img src={item.coverUrl} alt="" className="size-full object-cover" />}
					</div>
					<CardContent className="grid flex-1 gap-3 py-4">
						<div className="grid gap-1">
							<p className="font-medium leading-snug">{item.courseTitle}</p>
							<p className="text-muted-foreground text-sm">{t('home.nextLesson', { title: item.lessonTitle })}</p>
						</div>
						<ProgressBar pct={item.progressPct} label={t('my.progress', { pct: item.progressPct })} />
						<Button asChild className="justify-self-start">
							<Link
								to="/learn/courses/$courseId/lessons/$lessonId"
								params={{ courseId: item.courseId, lessonId: item.lessonId }}
								data-testid="home-continue-action"
							>
								{t('my.continue')}
							</Link>
						</Button>
					</CardContent>
				</div>
			</Card>
		</section>
	)
}

function Deadlines({ items }: { items: HomeDeadline[] }) {
	const { t } = useTranslation('learning')
	const dueText = useDueText()
	return (
		<section aria-labelledby="home-deadlines">
			<h2 id="home-deadlines" className="mb-2 font-medium">
				{t('home.deadlinesTitle')}
			</h2>
			<ul className="grid gap-1" data-testid="home-deadlines">
				{items.map((d) => (
					<li key={d.lessonId}>
						<Link
							to="/learn/courses/$courseId/lessons/$lessonId"
							params={{ courseId: d.courseId, lessonId: d.lessonId }}
							className={ROW}
							data-testid="home-deadline"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate">{d.lessonTitle}</span>
								<span className="block truncate text-muted-foreground text-xs">{d.courseTitle}</span>
							</span>
							<span
								className={cn('shrink-0 text-sm', d.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}
							>
								{dueText({ ...d, status: 'available' })}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	)
}

function Revisions({ items }: { items: MyRevision[] }) {
	const { t } = useTranslation('learning')
	return (
		<section aria-labelledby="home-revisions">
			<h2 id="home-revisions" className="mb-1 font-medium">
				{t('home.revisionsTitle')}
			</h2>
			<p className="mb-2 text-muted-foreground text-sm">{t('home.revisionsHint')}</p>
			<ul className="grid gap-1" data-testid="home-revisions">
				{items.map((r) => (
					<li key={r.submissionId}>
						<Link
							to="/learn/courses/$courseId/lessons/$lessonId"
							params={{ courseId: r.courseId, lessonId: r.lessonId }}
							className={ROW}
							data-testid="home-revision"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate">{r.lessonTitle}</span>
								<span className="block truncate text-muted-foreground text-xs">{r.courseTitle}</span>
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	)
}

function CourseTabs({ courses }: { courses: MyCourse[] }) {
	const { t } = useTranslation('learning')
	const present = TABS.filter((tab) => courses.some((c) => tabOf(c) === tab))
	const [picked, setPicked] = useState<Tab | null>(null)
	const active = picked && present.includes(picked) ? picked : (present[0] ?? 'learning')
	const shown = courses.filter((c) => tabOf(c) === active)
	return (
		<section aria-label={t('my.title')}>
			{present.length > 1 && (
				<div className="mb-4 flex flex-wrap gap-1 border-b pb-2" role="tablist" aria-label={t('my.tabsLabel')}>
					{present.map((tab) => (
						<button
							key={tab}
							type="button"
							role="tab"
							aria-selected={tab === active}
							className={cn(TAB, tab === active && 'bg-accent font-medium')}
							onClick={() => setPicked(tab)}
							data-testid={`my-tab-${tab}`}
						>
							{t(`my.tabs.${tab}`)}
						</button>
					))}
				</div>
			)}
			<ul className="grid gap-4 sm:grid-cols-2" data-testid="my-courses">
				{shown.map((c) => (
					<li key={c.id}>
						<CourseCard course={c} />
					</li>
				))}
			</ul>
		</section>
	)
}

function CourseCard({ course: c }: { course: MyCourse }) {
	const { t, i18n } = useTranslation('learning')
	const closed = c.expired || c.revoked
	const date = (d: Date | string) =>
		new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
	const action = closed
		? null
		: c.nextLessonId
			? { label: c.lessonsCompleted === 0 ? t('my.start') : t('my.continue'), lessonId: c.nextLessonId }
			: { label: t('my.repeat'), lessonId: null }
	return (
		<Card
			className="relative h-full overflow-hidden py-0 transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent/40"
			data-testid="my-course"
		>
			<div className="aspect-video bg-muted">
				{c.coverUrl && <img src={c.coverUrl} alt="" className="size-full object-cover" />}
			</div>
			<CardContent className="grid gap-2 pb-4">
				{/* ссылка растянута на всю карточку; кнопка действия — поверх */}
				<Link
					to="/learn/courses/$courseId"
					params={{ courseId: c.id }}
					className="after:absolute after:inset-0 focus-visible:outline-none"
					data-testid="my-course-open"
				>
					<h3 className="font-medium leading-snug">{c.title}</h3>
				</Link>
				{closed ? (
					<p className="text-destructive text-sm">{c.revoked ? t('my.revoked') : t('my.expired')}</p>
				) : (
					<>
						<ProgressBar
							pct={c.progressPct}
							label={t('my.lessons', { done: c.lessonsCompleted, count: c.lessonsTotal })}
						/>
						{c.expiresAt && (
							<p className="text-muted-foreground text-xs" data-testid="my-course-until">
								{t('my.until', { date: date(c.expiresAt) })}
							</p>
						)}
					</>
				)}
				{action && (
					<Button
						asChild
						variant={action.lessonId ? 'default' : 'outline'}
						size="sm"
						className="relative z-10 justify-self-start"
					>
						{action.lessonId ? (
							<Link
								to="/learn/courses/$courseId/lessons/$lessonId"
								params={{ courseId: c.id, lessonId: action.lessonId }}
								data-testid="my-course-action"
							>
								{action.label}
							</Link>
						) : (
							<Link to="/learn/courses/$courseId" params={{ courseId: c.id }} data-testid="my-course-action">
								{action.label}
							</Link>
						)}
					</Button>
				)}
				{c.completedAt && <MyCertificate courseId={c.id} className="relative z-10 justify-self-start" />}
			</CardContent>
		</Card>
	)
}
