import { lazy, Suspense } from 'react'
import { Skeleton } from '../components/ui/skeleton.tsx'
import type { RichTextEditorProps } from './editor.tsx'

const Editor = lazy(() => import('./editor.tsx'))

/** Редактор rich text; пока грузится — заглушка той же высоты. */
export function RichTextEditor(props: RichTextEditorProps) {
	return (
		<Suspense
			fallback={<Skeleton className="h-40 w-full" data-testid={props.testId ? `${props.testId}-loading` : undefined} />}
		>
			<Editor {...props} />
		</Suspense>
	)
}
