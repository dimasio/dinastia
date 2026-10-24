import type { Me } from '@dinastia/contracts/schools'
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@dinastia/ui'
import { Link } from '@tanstack/react-router'
import { House, Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UserMenu } from './user-menu.tsx'

/** Кабинет школы: сайдбар (на мобиле — выдвижная панель) + верхняя панель. Пункты меню — из фич (фаза 1.1, nav.ts). */
export function AdminShell({ me, children }: { me: Me; children: ReactNode }) {
	const { t } = useTranslation('nav')
	const nav = (
		<nav className="grid gap-1 p-2" aria-label={t('admin.title')}>
			<Link
				to="/admin"
				activeOptions={{ exact: true }}
				className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"
			>
				<House className="size-4" aria-hidden /> {t('admin.home')}
			</Link>
		</nav>
	)
	return (
		<div className="flex min-h-svh">
			<aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
				<div className="flex h-14 items-center px-5 font-semibold" data-testid="admin-school-name">
					{me.school.name}
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
					<span className="font-semibold md:hidden">{me.school.name}</span>
					<div className="ml-auto">
						<UserMenu name={me.user.name} email={me.user.email} role={me.member.role} />
					</div>
				</header>
				<main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
			</div>
		</div>
	)
}
