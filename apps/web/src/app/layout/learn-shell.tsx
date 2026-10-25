import type { Me } from '@dinastia/contracts/schools'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { navItems } from '#/features/index.ts'
import { visibleNav } from '../nav.ts'
import { UserMenu } from './user-menu.tsx'

/** Кабинет ученика: верхняя панель и контент; от 360px. */
export function LearnShell({ me, children }: { me: Me; children: ReactNode }) {
	const { t } = useTranslation('nav')
	return (
		<div className="flex min-h-svh flex-col">
			<header className="flex h-14 items-center gap-4 border-b px-4">
				<span className="truncate font-semibold" data-testid="learn-school-name">
					{me.school.name}
				</span>
				<nav className="ml-auto flex items-center gap-4 text-sm" aria-label={t('learn.title')}>
					{visibleNav(navItems, 'learn', me.permissions).flatMap(({ items }) =>
						items.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								activeOptions={{ exact: item.exact ?? false }}
								className="[&.active]:font-medium"
							>
								{t(item.label as never)}
							</Link>
						)),
					)}
					<UserMenu
						name={me.user.name}
						email={me.user.email}
						role={me.member.role}
						avatarUrl={me.member.avatarUrl}
						profileTo="/learn/profile"
					/>
				</nav>
			</header>
			<main className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-8">{children}</main>
		</div>
	)
}
