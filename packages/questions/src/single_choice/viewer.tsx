import { isEmptyDoc } from '@dinastia/contracts/common'
import { cn } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { Check, X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuestionViewerProps } from '../types.ts'
import type { singleChoice } from './definition.ts'

export default function SingleChoiceViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof singleChoice>) {
	const { t } = useTranslation('questions')
	const group = useId()
	const correct = new Set(review?.correct ?? [])
	return (
		<fieldset className="grid gap-3" data-testid={testId}>
			<legend className="contents">
				<RichTextView doc={data.prompt} />
			</legend>
			<p className="text-muted-foreground text-xs">{t('single_choice.choose')}</p>
			<div className="grid gap-2">
				{data.options.map((o, i) => {
					const checked = response?.selected === o.id
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
								type="radio"
								name={group}
								className="mt-1"
								checked={checked}
								disabled={!onChange}
								onChange={() => o.id && onChange?.({ selected: o.id })}
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
			{review?.explanation && !isEmptyDoc(review.explanation) && (
				<div className="rounded-md bg-muted p-3" data-testid={`${testId}-explanation`}>
					<p className="mb-1 font-medium text-sm">{t('host.explanation')}</p>
					<RichTextView doc={review.explanation} />
				</div>
			)}
		</fieldset>
	)
}
