import { Field, Input } from '@dinastia/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadButton } from '../media/upload-button.tsx'
import type { BlockEditorProps } from '../types.ts'
import { FileCard } from './card.tsx'
import type { file } from './definition.ts'

export default function FileEditor({
	value,
	onChange,
	readOnly,
	files,
	upload,
	testId,
}: BlockEditorProps<typeof file>) {
	const { t } = useTranslation('blocks')
	// только что загруженный — до ответа сервера с подписанной ссылкой
	const [local, setLocal] = useState<{ id: string; name: string; size: number }>()
	const saved = value.fileId ? files[value.fileId] : undefined
	const current = saved ?? (local && local.id === value.fileId ? local : undefined)
	return (
		<div className="grid gap-3">
			{current && <FileCard title={value.title || current.name} file={current} testId={`${testId}-card`} />}
			{!readOnly && upload && (
				<UploadButton
					kind="file"
					upload={upload}
					label={value.fileId ? t('file.replace') : t('file.upload')}
					onUploaded={(fileId, f) => {
						setLocal({ id: fileId, name: f.name, size: f.size })
						onChange({ ...value, fileId })
					}}
					testId={`${testId}-upload`}
				/>
			)}
			<Field id={`${testId}-title`} label={t('file.fields.title')} hint={t('file.titleHint')}>
				<Input
					id={`${testId}-title`}
					value={value.title ?? ''}
					maxLength={200}
					onChange={(e) => onChange({ ...value, title: e.target.value || null })}
					disabled={readOnly}
					data-testid={`${testId}-title`}
				/>
			</Field>
		</div>
	)
}
