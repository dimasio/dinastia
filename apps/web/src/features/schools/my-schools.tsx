import { Badge, Button, Card, CardContent, EmptyState, toast } from '@dinastia/ui'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { School } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function MySchools() {
	const { t, i18n } = useTranslation(['auth', 'common', 'errors'])
	const qc = useQueryClient()
	const { data } = useSuspenseQuery(orpc.schools.mine.queryOptions())
	const cancel = useMutation(
		orpc.schools.cancelDeletion.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: orpc.schools.mine.key() })
				toast.success(t('schools.cancelled'))
			},
			onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
		}),
	)
	const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'Europe/Moscow' })
	return (
		<div className="grid gap-3" data-testid="schools-mine">
			{data.length === 0 ? <EmptyState icon={School} title={t('schools.empty')} /> : null}
			{data.map((s) => (
				<Card key={s.id} className="min-w-0 py-4">
					<CardContent className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="truncate font-medium">{s.name}</p>
							<p className="text-sm text-muted-foreground">{t(`roles.${s.role}`, { ns: 'common' })}</p>
							{s.deleteAt ? (
								<Badge
									variant="destructive"
									className="mt-1 whitespace-normal"
									data-testid={`schools-deleting-${s.slug}`}
								>
									{t('schools.deleting', { date: date.format(s.deleteAt) })}
								</Badge>
							) : null}
						</div>
						{s.deleteAt ? (
							<Button
								variant="outline"
								className="shrink-0"
								disabled={cancel.isPending}
								onClick={() => cancel.mutate({ id: s.id })}
								data-testid={`schools-cancel-deletion-${s.slug}`}
							>
								{t('schools.cancelDeletion')}
							</Button>
						) : (
							<Button asChild variant="secondary" data-testid={`schools-open-${s.slug}`}>
								<a href={s.url}>{t('schools.open')}</a>
							</Button>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	)
}
