import { emptyDoc } from '@dinastia/contracts/common'
import { Button } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { multipleChoice } from './definition.ts'

export default function MultipleChoiceEditor({
	value,
	onChange,
	readOnly,
	testId,
}: QuestionEditorProps<typeof multipleChoice>) {
	const { t } = useTranslation('questions')
	const options = value.options
	const setOptions = (next: typeof options) => onChange({ ...value, options: next })
	return (
		<EditorFrame
			value={value}
			onChange={onChange}
			readOnly={readOnly}
			testId={testId}
			scoring={{ value: value.scoring, onChange: (scoring) => onChange({ ...value, scoring }) }}
		>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('multiple_choice.options')}</legend>
				{options.map((o, i) => (
					<div key={o.id ?? i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
						<label className="flex items-center gap-1.5 pt-2 text-sm">
							<input
								type="checkbox"
								checked={o.isCorrect}
								disabled={readOnly}
								onChange={(e) =>
									setOptions(options.map((x, j) => (j === i ? { ...x, isCorrect: e.target.checked } : x)))
								}
								data-testid={`${testId}-correct-${i}`}
							/>
							{t('multiple_choice.correct')}
						</label>
						<RichTextEditor
							profile="compact"
							value={o.body}
							onChange={(body) => setOptions(options.map((x, j) => (j === i ? { ...x, body } : x)))}
							aria-label={t('multiple_choice.option', { n: i + 1 })}
							disabled={readOnly === true}
							testId={`${testId}-option-${i}`}
							className="min-h-10"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('multiple_choice.removeOption', { n: i + 1 })}
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
					{t('multiple_choice.addOption')}
				</Button>
			</fieldset>
		</EditorFrame>
	)
}
