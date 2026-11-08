import { Button, cn } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { ordering } from './definition.ts'

export default function OrderingViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof ordering>) {
	const { t } = useTranslation('questions')
	const byId = new Map(data.steps.map((s) => [s.id, s]))
	const shown = response?.order.length ? response.order : data.steps.map((s) => s.id as string)
	// показанный порядок — и есть ответ: фиксируем его сразу, чтобы «не трогал» не значило «не ответил»
	useEffect(() => {
		if (!response && onChange) onChange({ order: data.steps.map((s) => s.id as string) })
	}, [])
	const move = (i: number, to: number) => {
		const next = [...shown]
		const [id] = next.splice(i, 1)
		if (id) next.splice(to, 0, id)
		onChange?.({ order: next })
	}
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('ordering.arrange')}>
			<ol className="grid gap-2">
				{shown.map((id, i) => {
					const step = byId.get(id)
					const right = review ? review.order[i] === id : undefined
					return (
						<li
							key={id}
							className={cn(
								'flex items-start gap-2 rounded-md border p-3',
								right === true && 'border-green-600 bg-green-500/10 dark:border-green-500',
								right === false && 'border-destructive bg-destructive/10',
							)}
							data-testid={`${testId}-step-${i}`}
							data-correct={right === true || undefined}
							data-wrong-choice={right === false || undefined}
						>
							<span className="pt-0.5 text-muted-foreground text-sm tabular-nums">{i + 1}.</span>
							{step && <RichTextView doc={step.body} className="min-w-0 flex-1" />}
							{right === true && (
								<Check className="size-4 text-green-600 dark:text-green-400" aria-label={t('host.correctAnswer')} />
							)}
							{right === false && <X className="size-4 text-destructive" aria-label={t('host.yourWrongAnswer')} />}
							{onChange && (
								<span className="flex">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('ordering.up', { n: i + 1 })}
										disabled={i === 0}
										onClick={() => move(i, i - 1)}
										data-testid={`${testId}-up-${i}`}
									>
										<ArrowUp />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('ordering.down', { n: i + 1 })}
										disabled={i === shown.length - 1}
										onClick={() => move(i, i + 1)}
										data-testid={`${testId}-down-${i}`}
									>
										<ArrowDown />
									</Button>
								</span>
							)}
						</li>
					)
				})}
			</ol>
			{review && (
				<div data-testid={`${testId}-correct-order`}>
					<p className="mb-1 font-medium text-sm">{t('ordering.correctOrder')}</p>
					<ol className="list-decimal pl-6 text-sm">
						{review.order.map((id) => {
							const step = id ? byId.get(id) : undefined
							return <li key={id}>{step && <RichTextView doc={step.body} />}</li>
						})}
					</ol>
				</div>
			)}
		</ViewerFrame>
	)
}
