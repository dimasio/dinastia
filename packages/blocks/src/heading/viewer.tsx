import type { BlockViewerProps } from '../types.ts'
import type { heading } from './definition.ts'

export default function HeadingViewer({ data, testId }: BlockViewerProps<typeof heading>) {
	if (!data.text.trim()) return null
	const Tag = data.level
	return (
		<Tag
			className={data.level === 'h2' ? 'mt-2 font-semibold text-2xl tracking-tight' : 'mt-1 font-semibold text-xl'}
			data-testid={testId}
		>
			{data.text}
		</Tag>
	)
}
