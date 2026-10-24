import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import type { ComponentProps, CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '#/lib/theme.tsx'

const style = {
	'--normal-bg': 'var(--popover)',
	'--normal-text': 'var(--popover-foreground)',
	'--normal-border': 'var(--border)',
	'--border-radius': 'var(--radius)',
} as CSSProperties

const icons = {
	success: <CircleCheckIcon className="size-4" />,
	info: <InfoIcon className="size-4" />,
	warning: <TriangleAlertIcon className="size-4" />,
	error: <OctagonXIcon className="size-4" />,
	loading: <Loader2Icon className="size-4 animate-spin" />,
}

function Toaster(props: ComponentProps<typeof Sonner>) {
	const { resolved } = useTheme()
	return <Sonner {...props} theme={resolved} className="toaster group" icons={icons} style={style} />
}

export { Toaster }
