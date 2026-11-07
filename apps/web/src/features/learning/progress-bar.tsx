/** Полоса прогресса с подписью (доступна экранному диктору как progressbar). */
export function ProgressBar({ pct, label }: { pct: number; label: string }) {
	return (
		<div className="grid gap-1">
			<div
				role="progressbar"
				aria-valuenow={pct}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={label}
				className="h-1.5 overflow-hidden rounded-full bg-muted"
			>
				<div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
			</div>
			<span className="text-muted-foreground text-xs" data-testid="progress-label">
				{label}
			</span>
		</div>
	)
}
