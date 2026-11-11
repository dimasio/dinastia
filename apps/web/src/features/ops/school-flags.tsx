// Фича-флаги школы в консоли (5.6д): поля настроек с `edit: []` — школа их не видит; подписи — из строк реестра настроек.
import { Card, CardContent, CardHeader, CardTitle, Switch, toast } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function SchoolFlags({ schoolId }: { schoolId: string }) {
	const { t } = useTranslation(['ops', 'settings', 'errors'])
	const qc = useQueryClient()
	const { data: flags = [] } = useQuery(orpc.ops.schools.flags.queryOptions({ input: { id: schoolId } }))
	const set = useMutation(
		orpc.ops.schools.setFlags.mutationOptions({
			onSuccess: (list) => qc.setQueryData(orpc.ops.schools.flags.queryKey({ input: { id: schoolId } }), list),
			onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
		}),
	)
	return (
		<Card data-testid="ops-school-flags">
			<CardHeader>
				<CardTitle>{t('card.flags')}</CardTitle>
			</CardHeader>
			<CardContent>
				{flags.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t('card.flagsEmpty')}</p>
				) : (
					<ul className="grid gap-3 text-sm">
						{flags.map((f) => (
							<li key={`${f.module}.${f.name}`} className="flex items-center justify-between gap-4">
								<span>
									{t(`settings:${f.module}.${f.name}.title` as never, { defaultValue: `${f.module}.${f.name}` })}
								</span>
								{f.kind === 'boolean' ? (
									<Switch
										checked={f.value === true}
										disabled={set.isPending}
										onCheckedChange={(v) => set.mutate({ id: schoolId, module: f.module, patch: { [f.name]: v } })}
										data-testid={`ops-flag-${f.module}-${f.name}`}
									/>
								) : (
									<span className="text-muted-foreground">{String(f.value)}</span>
								)}
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	)
}
