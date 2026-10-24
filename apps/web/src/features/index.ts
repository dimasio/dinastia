// Реестр фич веба: пункты меню областей. Новая фича — `pnpm gen:module` добавит строки у маркеров gen:module.
import type { NavItem } from '#/app/nav.ts'
import { nav as home } from './home/nav.ts'
// gen:module:nav-import

export const navItems: NavItem[] = [
	...home,
	// gen:module:nav
]
