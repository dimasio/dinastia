import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import type { text } from './definition.ts'

export default function TextEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof text>) {
	const { t } = useTranslation('blocks')
	return (
		<RichTextEditor
			id={`${testId}-body`}
			profile="lesson"
			value={value.body}
			onChange={(body) => onChange({ ...value, body })}
			placeholder={t('text.placeholder')}
			aria-label={t('text.fields.body')}
			disabled={readOnly === true}
			testId={`${testId}-body`}
		/>
	)
}
