import { RichTextView } from '@dinastia/ui/rich-text'
import type { BlockViewerProps } from '../types.ts'
import type { text } from './definition.ts'

export default function TextViewer({ data, files, testId }: BlockViewerProps<typeof text>) {
	return (
		<div data-testid={testId}>
			<RichTextView doc={data.body} resolveFile={(id) => files[id]?.url} />
		</div>
	)
}
