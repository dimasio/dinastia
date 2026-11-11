// Лэйаут консоли оператора `/ops` (5.6): не оператор — «не найдено»; без второго фактора — только его настройка; меню разделов.
import { Button, Skeleton } from '@dinastia/ui'
import { ResourceProvider } from '@dinastia/ui/resource'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { TwoFactorSetup } from './two-factor-setup.tsx'

const SECTIONS = [
	{ to: '/ops', key: 'schools', exact: true },
	{ to: '/ops/people', key: 'people', exact: false },
	{ to: '/ops/audit', key: 'audit', exact: false },
] as const

export function OpsLayout({ notFound }: { notFound: React.ReactNode }) {
	const { t } = useTranslation(['ops', 'errors'])
	const me = useQuery(orpc.ops.me.queryOptions({ retry: false }))
	if (me.isPending) return <Skeleton className="m-6 h-64" />
	if (me.error) return errorText(me.error) === 'UNAUTHENTICATED' ? null : notFound
	return (
		<div className="min-h-svh bg-muted/30">
			<header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
				<div className="flex flex-wrap items-center gap-4">
					<span className="font-semibold" data-testid="ops-title">
						{t('title')}
					</span>
					{me.data.twoFactorEnabled ? (
						<nav className="flex gap-1 text-sm">
							{SECTIONS.map((s) => (
								<Link
									key={s.key}
									to={s.to}
									activeOptions={{ exact: s.exact }}
									className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
									data-testid={`ops-nav-${s.key}`}
								>
									{t(`nav.${s.key}`)}
								</Link>
							))}
						</nav>
					) : null}
				</div>
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
			<main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
				{me.data.twoFactorEnabled ? (
					<ResourceProvider
						viewer={{ memberId: me.data.id, role: 'operator', permissions: ['ops'] }}
						errorText={(e) => t(errorText(e), { ns: 'errors' })}
					>
						<Outlet />
					</ResourceProvider>
				) : (
					<TwoFactorSetup />
				)}
			</main>
		</div>
	)
}
