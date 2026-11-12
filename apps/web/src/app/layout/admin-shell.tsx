import type { Me } from '@dinastia/contracts/schools'
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@dinastia/ui'
import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ImpersonationBanner } from './impersonation-banner.tsx'
import { SchoolLogo } from './school-logo.tsx'
import { SideNav } from './side-nav.tsx'
import { UserMenu } from './user-menu.tsx'

/** Кабинет школы: сайдбар (на мобиле — выдвижная панель) + верхняя панель. Пункты меню — из фич (features/<m>/nav.ts). */
export function AdminShell({ me, children }: { me: Me; children: ReactNode }) {
	const { t } = useTranslation(['nav', 'schools'])
	const nav = <SideNav area="admin" permissions={me.permissions} label={t('admin.title')} />
	return (
		<div className="flex min-h-svh">
			<aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
				<div className="flex h-14 items-center px-5" data-testid="admin-school-name">
					<SchoolLogo school={me.school} />
				</div>
				{nav}
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 items-center justify-between gap-2 border-b px-4">
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" className="md:hidden" aria-label={t('admin.title')}>
								<Menu className="size-5" />
							</Button>
						</SheetTrigger>
						<SheetContent side="left" className="w-64 bg-sidebar p-0">
							<SheetTitle className="px-5 pt-5">{me.school.name}</SheetTitle>
							{nav}
						</SheetContent>
					</Sheet>
					<SchoolLogo school={me.school} className="md:hidden" />
					<div className="ml-auto">
						<UserMenu
							name={me.user.name}
							email={me.user.email}
							role={me.member.role}
							avatarUrl={me.member.avatarUrl}
							profileTo="/admin/profile"
						/>
					</div>
				</header>
				<ImpersonationBanner me={me} />
				{me.suspension ? (
					<div
						role="alert"
						className="border-b bg-destructive/10 px-4 py-3 text-sm md:px-8"
						data-testid="school-suspended-banner"
					>
						{t('suspended', { ns: 'schools', reason: me.suspension.reason ?? '—' })}
					</div>
				) : null}
				<main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
			</div>
		</div>
	)
}
