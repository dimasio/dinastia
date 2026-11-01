import { isVideoUrl } from '@dinastia/contracts/common'
import { Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { EmbedUrlField } from '../embed/url-field.tsx'
import type { BlockEditorProps } from '../types.ts'
import type { video } from './definition.ts'

export default function VideoEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof video>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="grid gap-3">
			<EmbedUrlField
				id={`${testId}-url`}
				label={t('video.fields.url')}
				hint={t('video.hint')}
				value={value.url}
				valid={isVideoUrl}
				onChange={(url) => onChange({ ...value, url })}
				readOnly={readOnly}
				testId={`${testId}-url`}
			/>
			<Field id={`${testId}-caption`} label={t('video.fields.caption')}>
				<Input
					id={`${testId}-caption`}
					value={value.caption ?? ''}
					maxLength={300}
					onChange={(e) => onChange({ ...value, caption: e.target.value || null })}
					disabled={readOnly}
					data-testid={`${testId}-caption`}
				/>
			</Field>
		</div>
	)
}
