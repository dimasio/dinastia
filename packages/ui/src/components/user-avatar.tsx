import { cn } from '#/lib/utils.ts'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx'

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.map((p) => p[0])
		.join('')
		.slice(0, 2)
		.toUpperCase()

/** Аватар человека: фото по ссылке или инициалы (скилл ui-kit). */
export function UserAvatar({
	name,
	src,
	size = 'default',
	className,
}: {
	name: string
	src?: string | null | undefined
	size?: 'sm' | 'default' | 'lg'
	className?: string
}) {
	return (
		<Avatar size={size} className={className}>
			{src ? <AvatarImage src={src} alt={name} /> : null}
			<AvatarFallback className={cn(size === 'sm' && 'text-[10px]')}>{initials(name)}</AvatarFallback>
		</Avatar>
	)
}
