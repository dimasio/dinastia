// Меню областей (скилл web-screens): фича объявляет пункты в features/<m>/nav.ts, реестр — features/index.ts.
import type { Resources } from '@dinastia/i18n'
import type { LucideIcon } from 'lucide-react'
import type { FileRoutesByTo } from '#/routeTree.gen.ts'

export const NAV_GROUPS = ['main', 'content', 'learning', 'people', 'analytics', 'settings'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
	area: 'admin' | 'learn'
	/** Путь маршрута — только существующий (тип из routeTree.gen.ts). */
	to: keyof FileRoutesByTo
	/** Ключ строки `<ns>:<ключ>` (скилл i18n). */
	label: `${keyof Resources & string}:${string}`
	icon: LucideIcon
	/** Разрешение (скилл permissions); без него пункт виден всем участникам области. */
	perm?: string
	group: NavGroup
	order: number
	/** Активен только на точном совпадении пути (главная). */
	exact?: boolean
}

export const defineNav = (items: NavItem[]) => items

/** Пункты области, доступные роли, по группам в порядке NAV_GROUPS и order. */
export function visibleNav(items: NavItem[], area: NavItem['area'], permissions: readonly string[]) {
	const allowed = items.filter((i) => i.area === area && (!i.perm || permissions.includes(i.perm)))
	return NAV_GROUPS.map((group) => ({
		group,
		items: allowed.filter((i) => i.group === group).sort((a, b) => a.order - b.order),
	})).filter((g) => g.items.length > 0)
}
