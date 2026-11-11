// Карточка школы в консоли (5.6б): метрики считаются при открытии, сотрудники, действия консоли по школе.
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@dinastia/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { orpc } from '#/app/orpc.ts'
import { ActionLabel } from './resources.tsx'

export function SchoolCard({ id }: { id: string }) {
	const { t, i18n } = useTranslation(['ops', 'common'])
	const { data: s } = useSuspenseQuery(orpc.ops.schools.get.queryOptions({ input: { id } }))
	const dt = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Moscow',
	})
	const n = new Intl.NumberFormat(i18n.language)
	const metrics = [
		['students', n.format(s.students)],
		['activeStudents30d', n.format(s.activeStudents30d)],
		['courses', n.format(s.courses)],
		['storageBytes', `${(s.storageBytes / 1024 / 1024).toFixed(1)} МБ`],
		['lastActivityAt', s.lastActivityAt ? dt.format(s.lastActivityAt) : '—'],
		['createdAt', dt.format(s.createdAt)],
	] as const
	return (
		<div className="grid gap-6" data-testid="ops-school-card">
			<PageHeader
				title={s.name}
				description={
					<a href={s.url} className="underline-offset-4 hover:underline">
						{s.url}
					</a>
				}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={s.status === 'active' ? 'outline' : 'destructive'} data-testid="ops-school-status">
					{t(`schools.values.status.${s.status}`)}
				</Badge>
				{s.deletionRequestedAt ? (
					<span className="text-muted-foreground text-sm">
						{t('card.deletionRequested', { date: dt.format(s.deletionRequestedAt) })}
					</span>
				) : null}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{t('card.metrics')}</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
						{metrics.map(([k, v]) => (
							<div key={k}>
								<dt className="text-muted-foreground">{t(`schools.fields.${k}`)}</dt>
								<dd className="font-medium" data-testid={`ops-metric-${k}`}>
									{v}
								</dd>
							</div>
						))}
					</dl>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t('card.staff')}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="grid gap-2 text-sm" data-testid="ops-school-staff">
						{s.staff.map((m) => (
							<li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
								<span className="min-w-0">
									<span className="font-medium">{m.name}</span>{' '}
									<span className="break-all text-muted-foreground">{m.email}</span>
								</span>
								<Badge variant="outline">{t(`roles.${m.role}`, { ns: 'common' })}</Badge>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t('card.audit')}</CardTitle>
				</CardHeader>
				<CardContent>
					{s.audit.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t('card.auditEmpty')}</p>
					) : (
						<ul className="grid gap-2 text-sm">
							{s.audit.map((a) => (
								<li key={`${a.action}-${a.createdAt.toISOString()}`} className="flex flex-wrap justify-between gap-2">
									<span>
										<ActionLabel action={a.action} />
									</span>
									<span className="text-muted-foreground">
										{a.operatorEmail} · {dt.format(a.createdAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
