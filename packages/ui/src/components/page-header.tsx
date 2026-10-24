import type { ReactNode } from 'react'

/** Заголовок экрана с действиями справа (скилл ui-kit). */
export function PageHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode
	description?: ReactNode
	actions?: ReactNode
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-4 pb-6">
			<div className="min-w-0">
				<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{actions ? <div className="flex gap-2">{actions}</div> : null}
		</div>
	)
}
