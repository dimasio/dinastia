// Консоль оператора `/ops` (5.6, спека ops.md): не оператор — «не найдено»; без второго фактора — только его настройка.
import { Button, Skeleton } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { CreateSchool } from './create-school.tsx'
import { TwoFactorSetup } from './two-factor-setup.tsx'

export function OpsPage({ notFound }: { notFound: React.ReactNode }) {
	const { t } = useTranslation('ops')
	const me = useQuery(orpc.ops.me.queryOptions({ retry: false }))
	if (me.isPending) return <Skeleton className="m-6 h-64" />
	if (me.error) return errorText(me.error) === 'UNAUTHENTICATED' ? null : notFound
	return (
		<div className="min-h-svh bg-muted/30">
			<header className="flex items-center justify-between border-b bg-background px-4 py-3 sm:px-6">
				<span className="font-semibold" data-testid="ops-title">
					{t('title')}
				</span>
				<div className="flex items-center gap-3 text-sm">
					<span className="hidden text-muted-foreground sm:inline">{me.data.email}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={async () => {
							await authClient.signOut()
							window.location.assign('/')
						}}
					>
						{t('signOut')}
					</Button>
				</div>
			</header>
			<main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6">
				{me.data.twoFactorEnabled ? <CreateSchool /> : <TwoFactorSetup />}
			</main>
		</div>
	)
}
