import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { openText } from './definition.ts'

export default function OpenTextEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof openText>) {
	const { t } = useTranslation('questions')
	return (
		<EditorFrame value={value} onChange={onChange} readOnly={readOnly} testId={testId}>
			<p className="text-muted-foreground text-sm">{t('open_text.manualHint')}</p>
		</EditorFrame>
	)
}
