import { emptyDoc } from '@dinastia/contracts/common'
import { Button } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { ordering } from './definition.ts'

export default function OrderingEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof ordering>) {
	const { t } = useTranslation('questions')
	const steps = value.steps
	// массив — в верном порядке; номер в нём и есть верная позиция
	const setSteps = (next: typeof steps) =>
		onChange({ ...value, steps: next.map((s, i) => ({ ...s, correctPosition: i })) })
	const move = (i: number, to: number) => {
		const next = [...steps]
		const [item] = next.splice(i, 1)
		if (item) next.splice(to, 0, item)
		setSteps(next)
	}
	return (
		<EditorFrame
			value={value}
			onChange={onChange}
			readOnly={readOnly}
			testId={testId}
			scoring={{ value: value.scoring, onChange: (scoring) => onChange({ ...value, scoring }) }}
		>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('ordering.steps')}</legend>
				<p className="text-muted-foreground text-xs">{t('ordering.stepsHint')}</p>
				{steps.map((s, i) => (
					<div key={s.id ?? i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
						<span className="pt-2 text-muted-foreground text-sm tabular-nums">{i + 1}.</span>
						<RichTextEditor
							profile="compact"
							value={s.body}
							onChange={(body) => setSteps(steps.map((x, j) => (j === i ? { ...x, body } : x)))}
							aria-label={t('ordering.step', { n: i + 1 })}
							disabled={readOnly === true}
							testId={`${testId}-step-${i}`}
							className="min-h-10"
						/>
						<div className="flex">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t('ordering.up', { n: i + 1 })}
								disabled={readOnly || i === 0}
								onClick={() => move(i, i - 1)}
							>
								<ArrowUp />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t('ordering.down', { n: i + 1 })}
								disabled={readOnly || i === steps.length - 1}
								onClick={() => move(i, i + 1)}
							>
								<ArrowDown />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t('ordering.remove', { n: i + 1 })}
								disabled={readOnly || steps.length <= 2}
								onClick={() => setSteps(steps.filter((_, j) => j !== i))}
							>
								<Trash2 />
							</Button>
						</div>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					className="justify-self-start"
					disabled={readOnly || steps.length >= 10}
					onClick={() => setSteps([...steps, { body: emptyDoc(), correctPosition: steps.length }])}
					data-testid={`${testId}-add-step`}
				>
					<Plus />
					{t('ordering.addStep')}
				</Button>
			</fieldset>
		</EditorFrame>
	)
}
