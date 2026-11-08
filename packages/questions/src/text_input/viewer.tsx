import { Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { textInput } from './definition.ts'

export default function TextInputViewer({
	data,
	response,
	onChange,
	review,
	testId,
}: QuestionViewerProps<typeof textInput>) {
	const { t } = useTranslation('questions')
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('text_input.type')}>
			<Input
				value={response?.text ?? ''}
				maxLength={500}
				disabled={!onChange}
				aria-label={t('text_input.yourAnswer')}
				onChange={(e) => onChange?.({ text: e.target.value })}
				data-testid={`${testId}-input`}
			/>
			{review && (
				<p className="text-sm" data-testid={`${testId}-accepted`}>
					<span className="font-medium">{t('host.correctAnswer')}: </span>
					{review.accepted.join(' · ')}
				</p>
			)}
		</ViewerFrame>
	)
}
