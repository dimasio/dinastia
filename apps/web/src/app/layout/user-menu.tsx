import {
	Avatar,
	AvatarFallback,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	type Theme,
	useTheme,
} from '@dinastia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { hostUrl } from '#/app/host.ts'

const initials = (name: string) =>
	name
		.split(/\s+/)
		.map((p) => p[0])
		.join('')
		.slice(0, 2)
		.toUpperCase()

export function UserMenu({ name, email, role }: { name: string; email: string; role?: string }) {
	const { t } = useTranslation(['common', 'nav'])
	const { theme, setTheme } = useTheme()
	const qc = useQueryClient()
	async function signOut() {
		await authClient.signOut()
		qc.clear()
		window.location.assign('/')
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full" aria-label={name} data-testid="user-menu">
					<Avatar className="size-8">
						<AvatarFallback>{initials(name)}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="font-normal">
					<p className="truncate font-medium">{name}</p>
					<p className="truncate text-xs text-muted-foreground">{email}</p>
					{role ? <p className="text-xs text-muted-foreground">{t(`roles.${role}` as 'roles.owner')}</p> : null}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs text-muted-foreground">{t('theme.title')}</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
					<DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a href={hostUrl()}>{t('switchSchool', { ns: 'nav' })}</a>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={signOut} data-testid="user-menu-sign-out">
					{t('signOut')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
