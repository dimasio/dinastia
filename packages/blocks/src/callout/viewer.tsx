import { cn } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { CircleAlert, Info, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BlockViewerProps } from '../types.ts'
import type { callout } from './definition.ts'

const TONE = {
	info: { icon: Info, className: 'border-blue-500/40 bg-blue-500/10 [&_svg]:text-blue-600 dark:[&_svg]:text-blue-400' },
	warning: {
		icon: CircleAlert,
		className: 'border-amber-500/50 bg-amber-500/10 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400',
	},
	success: {
		icon: Lightbulb,
		className: 'border-green-500/40 bg-green-500/10 [&_svg]:text-green-600 dark:[&_svg]:text-green-400',
	},
} as const

export default function CalloutViewer({ data, testId }: BlockViewerProps<typeof callout>) {
	const { t } = useTranslation('blocks')
	const tone = TONE[data.tone]
	const Icon = tone.icon
	return (
		<aside
			className={cn('flex gap-3 rounded-lg border p-4', tone.className)}
			aria-label={t(`callout.tones.${data.tone}`)}
			data-testid={testId}
			data-tone={data.tone}
		>
			<Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
			<RichTextView doc={data.body} className="min-w-0 flex-1" />
		</aside>
	)
}
