// Поиск человека по точной почте (5.6б): его школы и роли, последний вход. Каждый поиск — в журнале консоли.
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	Field,
	Input,
	PageHeader,
} from '@dinastia/ui'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { UserSearch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function People() {
	const { t, i18n } = useTranslation(['ops', 'common', 'errors'])
	const [email, setEmail] = useState('')
	const find = useMutation(orpc.ops.people.find.mutationOptions())
	const dt = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Moscow',
	})
	const person = find.data
	return (
		<div className="grid gap-6">
			<PageHeader title={t('people.title')} description={t('people.description')} />
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(e) => {
					e.preventDefault()
					find.mutate({ email: email.trim() })
				}}
			>
				<div className="min-w-0 flex-1">
					<Field id="ops-people-email" label={t('people.email')}>
						<Input
							id="ops-people-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							data-testid="ops-people-email"
						/>
					</Field>
				</div>
				<Button type="submit" disabled={!email.trim() || find.isPending} data-testid="ops-people-find">
					{t('people.find')}
				</Button>
			</form>
			{find.error ? (
				<p role="alert" className="text-destructive text-sm">
					{t(errorText(find.error), { ns: 'errors' })}
				</p>
			) : null}
			{find.isSuccess && !person ? <EmptyState icon={UserSearch} title={t('people.notFound')} /> : null}
			{person ? (
				<Card data-testid="ops-person">
					<CardHeader>
						<CardTitle>
							{person.name} {person.operator ? <Badge variant="secondary">{t('people.operator')}</Badge> : null}
						</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 text-sm">
						<dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
							<dt className="text-muted-foreground">{t('people.email')}</dt>
							<dd className="break-all">{person.email}</dd>
							<dt className="text-muted-foreground">{t('people.createdAt')}</dt>
							<dd>{dt.format(person.createdAt)}</dd>
							<dt className="text-muted-foreground">{t('people.lastSignInAt')}</dt>
							<dd>{person.lastSignInAt ? dt.format(person.lastSignInAt) : '—'}</dd>
						</dl>
						{person.schools.length === 0 ? (
							<p className="text-muted-foreground">{t('people.noSchools')}</p>
						) : (
							<ul className="grid gap-2" data-testid="ops-person-schools">
								{person.schools.map((s) => (
									<li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
										<Link
											to="/ops/schools/$id"
											params={{ id: s.id }}
											className="font-medium underline-offset-4 hover:underline"
										>
											{s.name}
										</Link>
										<span className="flex gap-2">
											<Badge variant="outline">{t(`roles.${s.role}`, { ns: 'common' })}</Badge>
											{s.status !== 'active' ? (
												<Badge variant="destructive">{t(`people.memberStatus.${s.status}` as never)}</Badge>
											) : null}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			) : null}
		</div>
	)
}
