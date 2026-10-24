import { Button, Card, CardContent, EmptyState } from '@dinastia/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { School } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { orpc } from '#/app/orpc.ts'

export function MySchools() {
	const { t } = useTranslation(['auth', 'common'])
	const { data } = useSuspenseQuery(orpc.schools.mine.queryOptions())
	return (
		<div className="grid gap-3" data-testid="schools-mine">
			{data.length === 0 ? <EmptyState icon={School} title={t('schools.empty')} /> : null}
			{data.map((s) => (
				<Card key={s.id} className="py-4">
					<CardContent className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="truncate font-medium">{s.name}</p>
							<p className="text-sm text-muted-foreground">{t(`roles.${s.role}`, { ns: 'common' })}</p>
						</div>
						<Button asChild variant="secondary" data-testid={`schools-open-${s.slug}`}>
							<a href={s.url}>{t('schools.open')}</a>
						</Button>
					</CardContent>
				</Card>
			))}
			<Button asChild variant="link" className="justify-self-start px-0">
				<Link to="/register">{t('schools.create')}</Link>
			</Button>
		</div>
	)
}
