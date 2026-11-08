import { Textarea } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { openText } from './definition.ts'

export default function OpenTextViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof openText>) {
	const { t } = useTranslation('questions')
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('open_text.type')}>
			<Textarea
				value={response?.text ?? ''}
				rows={6}
				maxLength={5000}
				disabled={!onChange}
				aria-label={t('open_text.yourAnswer')}
				onChange={(e) => onChange?.({ text: e.target.value })}
				data-testid={`${testId}-input`}
			/>
		</ViewerFrame>
	)
}
