import { isVideoUrl } from '@dinastia/contracts/common'
import { Button, Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { EmbedUrlField } from '../embed/url-field.tsx'
import { UploadButton } from '../media/upload-button.tsx'
import type { BlockEditorProps } from '../types.ts'
import type { video } from './definition.ts'

export default function VideoEditor({ value, onChange, readOnly, upload, testId }: BlockEditorProps<typeof video>) {
	const { t } = useTranslation('blocks')
	const isUpload = value.source === 'upload'
	return (
		<div className="grid gap-3">
			{!readOnly && (
				<fieldset className="flex min-w-0 gap-2 border-0 p-0">
					<legend className="sr-only">{t('video.source.label')}</legend>
					{(['link', 'upload'] as const).map((s) => (
						<Button
							key={s}
							type="button"
							size="sm"
							variant={value.source === s ? 'default' : 'outline'}
							aria-pressed={value.source === s}
							onClick={() => value.source !== s && onChange({ ...value, source: s })}
							data-testid={`${testId}-source-${s}`}
						>
							{t(`video.source.${s}`)}
						</Button>
					))}
				</fieldset>
			)}
			{isUpload ? (
				<div className="grid gap-2">
					{value.videoId && (
						<p className="text-sm" role="status" data-status={value.status ?? ''} data-testid={`${testId}-status`}>
							{t(`video.status.${value.status ?? 'processing'}`)}
						</p>
					)}
					{!readOnly && upload && (
						<UploadButton
							kind="video"
							upload={upload}
							label={value.videoId ? t('video.replace') : t('video.upload')}
							onUploaded={() => undefined}
							testId={`${testId}-upload`}
						/>
					)}
				</div>
			) : (
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
			)}
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
