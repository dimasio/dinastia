import type { CurrentSchool } from '@dinastia/contracts/schools'
import { cn } from '@dinastia/ui'

/** Логотип школы из оформления (5.9); нет логотипа — название. Название остаётся для чтения с экрана (alt). */
export function SchoolLogo({ school, className }: { school: CurrentSchool; className?: string }) {
	if (!school.logoUrl) return <span className={cn('truncate font-semibold', className)}>{school.name}</span>
	return (
		<img
			src={school.logoUrl}
			alt={school.name}
			className={cn('h-8 w-auto max-w-40 object-contain', className)}
			data-testid="school-logo"
		/>
	)
}
