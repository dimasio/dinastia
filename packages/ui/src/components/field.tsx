import type { ReactNode } from 'react'
import { Label } from './ui/label.tsx'

/** Поле формы: подпись, контрол, подсказка или ошибка (связаны с контролом через aria). */
export function Field({
	id,
	label,
	hint,
	error,
	children,
}: {
	id: string
	label: ReactNode
	hint?: ReactNode
	error?: string | undefined
	children: ReactNode
}) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? (
				<p id={`${id}-error`} role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : hint ? (
				<p id={`${id}-hint`} className="text-sm text-muted-foreground">
					{hint}
				</p>
			) : null}
		</div>
	)
}
