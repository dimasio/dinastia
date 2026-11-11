// Карточка школы в консоли (5.6б): метрики считаются при открытии, сотрудники, действия консоли по школе.
import { errorKey } from '@dinastia/i18n'
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	PageHeader,
	toast,
} from '@dinastia/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { orpc } from '#/app/orpc.ts'
import { ActionLabel } from './resources.tsx'
import { SchoolFlags } from './school-flags.tsx'
import { SuspensionActions } from './suspension-actions.tsx'

export function SchoolCard({ id }: { id: string }) {
	const { t, i18n } = useTranslation(['ops', 'common', 'errors'])
	const { data: s } = useSuspenseQuery(orpc.ops.schools.get.queryOptions({ input: { id } }))
	const dt = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Moscow',
	})
	const n = new Intl.NumberFormat(i18n.language)
	const supportOpen = Boolean(s.supportAccessUntil && s.supportAccessUntil > new Date())
	const impersonate = async (memberId: string) => {
		const res = await authClient.$fetch<{ url: string }>('/impersonation/start', {
			method: 'POST',
			body: { schoolId: s.id, memberId },
		})
		if (res.error)
			return toast.error(t(errorKey(String((res.error as { code?: string }).code ?? 'UNKNOWN')), { ns: 'errors' }))
		window.location.assign(res.data.url)
	}
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
				{s.suspendedReason ? (
					<span className="text-muted-foreground text-sm" data-testid="ops-suspended-reason">
						{t('card.suspendedReason', { reason: s.suspendedReason })}
					</span>
				) : null}
				<span className="ml-auto">
					<SuspensionActions school={s} />
				</span>
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
					<CardDescription data-testid="ops-support-access">
						{supportOpen
							? t('card.supportOpen', { date: dt.format(s.supportAccessUntil as Date) })
							: t('card.supportClosed')}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="grid gap-2 text-sm" data-testid="ops-school-staff">
						{s.staff.map((m) => (
							<li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
								<span className="min-w-0">
									<span className="font-medium">{m.name}</span>{' '}
									<span className="break-all text-muted-foreground">{m.email}</span>
								</span>
								<span className="flex items-center gap-2">
									<Badge variant="outline">{t(`roles.${m.role}`, { ns: 'common' })}</Badge>
									{supportOpen && m.role !== 'owner' && m.status === 'active' ? (
										<Button
											size="sm"
											variant="outline"
											onClick={() => impersonate(m.id)}
											data-testid={`ops-impersonate-${m.role}`}
										>
											{t('card.impersonate')}
										</Button>
									) : null}
								</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
			<SchoolFlags schoolId={s.id} />
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
