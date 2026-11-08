import { Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { number } from './definition.ts'

export default function NumberEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof number>) {
	const { t } = useTranslation('questions')
	return (
		<EditorFrame value={value} onChange={onChange} readOnly={readOnly} testId={testId}>
			<div className="flex flex-wrap gap-4">
				<Field id={`${testId}-answer`} label={t('number.answer')}>
					<Input
						id={`${testId}-answer`}
						type="number"
						step="any"
						className="w-40"
						value={Number.isNaN(value.numberAnswer) ? '' : value.numberAnswer}
						disabled={readOnly}
						onChange={(e) =>
							onChange({ ...value, numberAnswer: e.target.value === '' ? Number.NaN : Number(e.target.value) })
						}
						data-testid={`${testId}-answer`}
					/>
				</Field>
				<Field id={`${testId}-tolerance`} label={t('number.tolerance')} hint={t('number.toleranceHint')}>
					<Input
						id={`${testId}-tolerance`}
						type="number"
						step="any"
						min={0}
						className="w-40"
						value={Number.isNaN(value.numberTolerance) ? '' : value.numberTolerance}
						disabled={readOnly}
						onChange={(e) =>
							onChange({ ...value, numberTolerance: e.target.value === '' ? Number.NaN : Number(e.target.value) })
						}
						data-testid={`${testId}-tolerance`}
					/>
				</Field>
			</div>
		</EditorFrame>
	)
}
