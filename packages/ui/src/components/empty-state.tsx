import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Пустое состояние: что здесь будет + первое действие (скилл ux-writing). */
export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon?: LucideIcon
	title: ReactNode
	description?: ReactNode
	action?: ReactNode
}) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
			{Icon ? <Icon className="mb-3 size-8 text-muted-foreground" aria-hidden /> : null}
			<p className="font-medium">{title}</p>
			{description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	)
}
