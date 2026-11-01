import { Button, Field, Input } from '@dinastia/ui'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UploadButton, useFileUrl } from '../media/upload-button.tsx'
import type { BlockEditorProps } from '../types.ts'
import type { image } from './definition.ts'

export default function ImageEditor({
	value,
	onChange,
	readOnly,
	files,
	upload,
	testId,
}: BlockEditorProps<typeof image>) {
	const { t } = useTranslation('blocks')
	const { url, remember } = useFileUrl(files)
	const src = url(value.fileId)
	return (
		<div className="grid gap-3">
			{src && (
				<img
					src={src}
					alt={value.alt ?? ''}
					className="max-h-80 w-fit max-w-full rounded-md border object-contain"
					data-testid={`${testId}-preview`}
				/>
			)}
			{!readOnly && upload && (
				<UploadButton
					kind="image"
					upload={upload}
					label={value.fileId ? t('image.replace') : t('image.upload')}
					onUploaded={(fileId, file) => {
						remember(fileId, file)
						onChange({ ...value, fileId })
					}}
					testId={`${testId}-upload`}
				>
					{value.fileId && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onChange({ ...value, fileId: null })}
							data-testid={`${testId}-remove`}
						>
							<Trash2 />
							{t('image.remove')}
						</Button>
					)}
				</UploadButton>
			)}
			<Field id={`${testId}-alt`} label={t('image.fields.alt')} hint={t('image.altHint')}>
				<Input
					id={`${testId}-alt`}
					value={value.alt ?? ''}
					maxLength={300}
					onChange={(e) => onChange({ ...value, alt: e.target.value || null })}
					disabled={readOnly}
					data-testid={`${testId}-alt`}
				/>
			</Field>
			<Field id={`${testId}-caption`} label={t('image.fields.caption')}>
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
