import type { BlockViewerProps } from '../types.ts'
import type { divider } from './definition.ts'

export default function DividerViewer({ testId }: BlockViewerProps<typeof divider>) {
	return <hr className="my-2 border-border" data-testid={testId} />
}
