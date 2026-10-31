import { emptyDoc, isEmptyDoc } from '@dinastia/contracts/common'
import { Button, Field, Input } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuestionEditorProps } from '../types.ts'
import type { singleChoice } from './definition.ts'

export default function SingleChoiceEditor({
	value,
	onChange,
	readOnly,
	testId,
}: QuestionEditorProps<typeof singleChoice>) {
	const { t } = useTranslation('questions')
	const group = useId()
	const options = value.options
	const setOptions = (next: typeof options) => onChange({ ...value, options: next })
	return (
		<div className="grid gap-4">
			<Field id={`${testId}-prompt`} label={t('fields.prompt')}>
				<RichTextEditor
					id={`${testId}-prompt`}
					profile="lesson"
					value={value.prompt}
					onChange={(prompt) => onChange({ ...value, prompt })}
					aria-label={t('fields.prompt')}
					disabled={readOnly === true}
					testId={`${testId}-prompt`}
				/>
			</Field>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('single_choice.options')}</legend>
				{options.map((o, i) => (
					<div key={o.id ?? i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
						<label className="flex items-center gap-1.5 pt-2 text-sm">
							<input
								type="radio"
								name={group}
								checked={o.isCorrect}
								disabled={readOnly}
								onChange={() => setOptions(options.map((x, j) => ({ ...x, isCorrect: j === i })))}
								data-testid={`${testId}-correct-${i}`}
							/>
							{t('single_choice.correct')}
						</label>
						<RichTextEditor
							profile="compact"
							value={o.body}
							onChange={(body) => setOptions(options.map((x, j) => (j === i ? { ...x, body } : x)))}
							aria-label={t('single_choice.option', { n: i + 1 })}
							disabled={readOnly === true}
							testId={`${testId}-option-${i}`}
							className="min-h-10"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('single_choice.removeOption', { n: i + 1 })}
							disabled={readOnly || options.length <= 2}
							onClick={() => setOptions(options.filter((_, j) => j !== i))}
						>
							<Trash2 />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					className="justify-self-start"
					disabled={readOnly || options.length >= 20}
					onClick={() => setOptions([...options, { body: emptyDoc(), isCorrect: false }])}
					data-testid={`${testId}-add-option`}
				>
					<Plus />
					{t('single_choice.addOption')}
				</Button>
			</fieldset>
			<Field id={`${testId}-points`} label={t('fields.points')}>
				<Input
					id={`${testId}-points`}
					type="number"
					min={1}
					max={100}
					className="w-24"
					value={value.points}
					disabled={readOnly}
					onChange={(e) => onChange({ ...value, points: Number(e.target.value) })}
					data-testid={`${testId}-points`}
				/>
			</Field>
			<Field id={`${testId}-explanation`} label={t('fields.explanation')}>
				<RichTextEditor
					id={`${testId}-explanation`}
					profile="compact"
					value={value.explanation ?? emptyDoc()}
					onChange={(explanation) => onChange({ ...value, explanation: isEmptyDoc(explanation) ? null : explanation })}
					aria-label={t('fields.explanation')}
					disabled={readOnly === true}
					testId={`${testId}-explanation`}
				/>
			</Field>
		</div>
	)
}
