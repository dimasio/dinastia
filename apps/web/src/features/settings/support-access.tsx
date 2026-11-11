// «Доступ поддержки Dinastia» (5.6г): owner/admin разрешает оператору войти от имени участника на 7 дней или закрывает доступ.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function SupportAccess() {
	const { t, i18n } = useTranslation(['settings', 'errors'])
	const qc = useQueryClient()
	const { data } = useQuery(orpc.schools.supportAccess.get.queryOptions())
	const set = useMutation(
		orpc.schools.supportAccess.set.mutationOptions({
			onSuccess: (res) => qc.setQueryData(orpc.schools.supportAccess.get.queryKey(), res),
			onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
		}),
	)
	const until = data?.until ?? null
	const date = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'Europe/Moscow',
	})
	return (
		<Card data-testid="settings-support-access">
			<CardHeader>
				<CardTitle>{t('supportAccess.title')}</CardTitle>
				<CardDescription>{t('supportAccess.description')}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<span className="text-sm" data-testid="support-access-state">
					{until ? t('supportAccess.openUntil', { date: date.format(until) }) : t('supportAccess.closed')}
				</span>
				<Button
					variant={until ? 'outline' : 'default'}
					disabled={set.isPending || !data}
					onClick={() => set.mutate({ open: !until })}
					data-testid="support-access-toggle"
				>
					{until ? t('supportAccess.close') : t('supportAccess.open')}
				</Button>
			</CardContent>
		</Card>
	)
}
