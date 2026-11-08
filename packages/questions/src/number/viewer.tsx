import { Input } from '@dinastia/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewerFrame } from '../shared.tsx'
import type { QuestionViewerProps } from '../types.ts'
import type { number } from './definition.ts'

/** Число из ввода: запятая и точка — десятичный разделитель; пусто или не число — null. */
export const parseNumber = (s: string): number | null => {
	const n = Number(s.trim().replace(',', '.'))
	return s.trim() === '' || !Number.isFinite(n) ? null : n
}

export default function NumberViewer({ data, response, onChange, review, testId }: QuestionViewerProps<typeof number>) {
	const { t } = useTranslation('questions')
	const [text, setText] = useState(response?.value == null ? '' : String(response.value).replace('.', ','))
	return (
		<ViewerFrame prompt={data.prompt} review={review} testId={testId} hint={t('number.type')}>
			<Input
				value={text}
				inputMode="decimal"
				className="w-48"
				disabled={!onChange}
				aria-label={t('number.yourAnswer')}
				onChange={(e) => {
					setText(e.target.value)
					onChange?.({ value: parseNumber(e.target.value) })
				}}
				data-testid={`${testId}-input`}
			/>
			{review && (
				<p className="text-sm" data-testid={`${testId}-answer`}>
					<span className="font-medium">{t('host.correctAnswer')}: </span>
					{String(review.answer).replace('.', ',')}
					{review.tolerance > 0 && ` ± ${String(review.tolerance).replace('.', ',')}`}
				</p>
			)}
		</ViewerFrame>
	)
}
