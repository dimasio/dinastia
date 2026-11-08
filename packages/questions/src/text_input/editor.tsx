import { Button, Field, Input } from '@dinastia/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { textInput } from './definition.ts'

export default function TextInputEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof textInput>) {
	const { t } = useTranslation('questions')
	const accepted = value.accepted
	const setAccepted = (next: typeof accepted) => onChange({ ...value, accepted: next })
	return (
		<EditorFrame value={value} onChange={onChange} readOnly={readOnly} testId={testId}>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('text_input.accepted')}</legend>
				<p className="text-muted-foreground text-xs">{t('text_input.acceptedHint')}</p>
				{accepted.map((a, i) => (
					<div key={a.id ?? i} className="grid grid-cols-[1fr_auto] items-center gap-2">
						<Input
							value={a.text}
							maxLength={200}
							disabled={readOnly}
							aria-label={t('text_input.answer', { n: i + 1 })}
							onChange={(e) => setAccepted(accepted.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
							data-testid={`${testId}-accepted-${i}`}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t('text_input.removeAnswer', { n: i + 1 })}
							disabled={readOnly || accepted.length <= 1}
							onClick={() => setAccepted(accepted.filter((_, j) => j !== i))}
						>
							<Trash2 />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					className="justify-self-start"
					disabled={readOnly || accepted.length >= 20}
					onClick={() => setAccepted([...accepted, { text: '' }])}
					data-testid={`${testId}-add-accepted`}
				>
					<Plus />
					{t('text_input.addAnswer')}
				</Button>
			</fieldset>
			<Field id={`${testId}-case`} label={t('text_input.caseSensitive')}>
				<label className="flex items-center gap-2 text-sm">
					<input
						id={`${testId}-case`}
						type="checkbox"
						checked={value.caseSensitive}
						disabled={readOnly}
						onChange={(e) => onChange({ ...value, caseSensitive: e.target.checked })}
						data-testid={`${testId}-case`}
					/>
					{t('text_input.caseSensitiveHint')}
				</label>
			</Field>
		</EditorFrame>
	)
}
