import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { navItems } from '#/features/index.ts'
import { type NavItem, visibleNav } from '../nav.ts'

/** Меню области из реестра фич; недоступное роли не показывается (запрещает всё равно сервер). */
export function SideNav({
	area,
	permissions,
	label,
}: {
	area: NavItem['area']
	permissions: readonly string[]
	label: string
}) {
	const { t } = useTranslation('nav')
	return (
		<nav className="grid gap-4 p-2" aria-label={label}>
			{visibleNav(navItems, area, permissions).map(({ group, items }) => (
				<div key={group} className="grid gap-1">
					{group !== 'main' ? (
						<p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t(`groups.${group}`)}</p>
					) : null}
					{items.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeOptions={{ exact: item.exact ?? false }}
							className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"
							data-testid={`nav-${item.to.replaceAll('/', '-').replace(/^-/, '')}`}
						>
							<item.icon className="size-4" aria-hidden /> {t(item.label as never)}
						</Link>
					))}
				</div>
			))}
		</nav>
	)
}
