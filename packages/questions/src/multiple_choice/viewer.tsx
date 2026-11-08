import { cn } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { multipleChoice } from './definition.ts'

export default function MultipleChoiceViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof multipleChoice>) {
	const { t } = useTranslation('questions')
	const selected = new Set(response?.selected ?? [])
	const correct = new Set(review?.correct ?? [])
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('multiple_choice.choose')}>
			<div className="grid gap-2">
				{data.options.map((o, i) => {
					const checked = o.id !== undefined && selected.has(o.id)
					const isRight = review && o.id !== undefined && correct.has(o.id)
					const isWrongChoice = review && checked && !isRight
					return (
						<label
							key={o.id ?? i}
							className={cn(
								'flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
								!onChange && 'cursor-default',
								isRight && 'border-green-600 bg-green-500/10 dark:border-green-500',
								isWrongChoice && 'border-destructive bg-destructive/10 has-[:checked]:border-destructive',
							)}
							data-testid={`${testId}-option-${i}`}
							data-correct={isRight || undefined}
							data-wrong-choice={isWrongChoice || undefined}
						>
							<input
								type="checkbox"
								className="mt-1"
								checked={checked}
								disabled={!onChange}
								onChange={(e) => {
									if (!o.id) return
									const next = new Set(selected)
									if (e.target.checked) next.add(o.id)
									else next.delete(o.id)
									onChange?.({ selected: [...next] })
								}}
							/>
							<RichTextView doc={o.body} className="min-w-0 flex-1" />
							{isRight && (
								<Check className="size-4 text-green-600 dark:text-green-400" aria-label={t('host.correctAnswer')} />
							)}
							{isWrongChoice && <X className="size-4 text-destructive" aria-label={t('host.yourWrongAnswer')} />}
						</label>
					)
				})}
			</div>
		</ViewerFrame>
	)
}
