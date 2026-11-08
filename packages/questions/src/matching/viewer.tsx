import { toPlainText } from '@dinastia/contracts/common'
import { cn } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { matching } from './definition.ts'

export default function MatchingViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof matching>) {
	const { t } = useTranslation('questions')
	const chosen = new Map((response?.pairs ?? []).map((p) => [p.left, p.right]))
	const rightById = new Map(data.right.map((r) => [r.id as string, r]))
	const set = (left: string, right: string) => {
		const next = new Map(chosen)
		if (right) next.set(left, right)
		else next.delete(left)
		onChange?.({ pairs: [...next].map(([l, r]) => ({ left: l, right: r })) })
	}
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('matching.choose')}>
			<div className="grid gap-2">
				{data.left.map((l, i) => {
					const id = l.id as string
					const picked = chosen.get(id)
					const correctRight = review?.pairs.find((p) => p.left === id)?.right
					const isRight = review ? picked !== undefined && picked === correctRight : undefined
					const correctBody = correctRight ? rightById.get(correctRight)?.body : undefined
					return (
						<div
							key={id}
							className={cn(
								'grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center',
								isRight === true && 'border-green-600 bg-green-500/10 dark:border-green-500',
								isRight === false && 'border-destructive bg-destructive/10',
							)}
							data-testid={`${testId}-row-${i}`}
							data-correct={isRight === true || undefined}
							data-wrong-choice={isRight === false || undefined}
						>
							<RichTextView doc={l.body} />
							<select
								className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
								value={picked ?? ''}
								disabled={!onChange}
								aria-label={t('matching.pickFor', { text: toPlainText(l.body, { maxLength: 60 }) })}
								onChange={(e) => set(id, e.target.value)}
								data-testid={`${testId}-select-${i}`}
							>
								<option value="">{t('matching.pick')}</option>
								{data.right.map((r) => (
									<option key={r.id} value={r.id}>
										{toPlainText(r.body, { maxLength: 80 })}
									</option>
								))}
							</select>
							<span className="flex items-center gap-1 text-sm">
								{isRight === true && (
									<Check className="size-4 text-green-600 dark:text-green-400" aria-label={t('host.correctAnswer')} />
								)}
								{isRight === false && (
									<>
										<X className="size-4 text-destructive" aria-label={t('host.yourWrongAnswer')} />
										<span data-testid={`${testId}-correct-${i}`}>
											{correctBody && toPlainText(correctBody, { maxLength: 80 })}
										</span>
									</>
								)}
							</span>
						</div>
					)
				})}
			</div>
		</ViewerFrame>
	)
}
