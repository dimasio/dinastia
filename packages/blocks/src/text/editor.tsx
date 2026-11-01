import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import { useFileUrl } from '../media/upload-button.tsx'
import type { BlockEditorProps } from '../types.ts'
import type { text } from './definition.ts'

export default function TextEditor({
	value,
	onChange,
	readOnly,
	files,
	upload,
	testId,
}: BlockEditorProps<typeof text>) {
	const { t } = useTranslation('blocks')
	const { url, remember } = useFileUrl(files)
	return (
		<RichTextEditor
			id={`${testId}-body`}
			profile="lesson"
			value={value.body}
			onChange={(body) => onChange({ ...value, body })}
			placeholder={t('text.placeholder')}
			aria-label={t('text.fields.body')}
			disabled={readOnly === true}
			// картинка в тексте — файл школы (2.7); без upload кнопки картинки нет
			{...(upload && !readOnly
				? {
						uploadImage: async (file: File) => {
							const fileId = await upload(file, { kind: 'image', onProgress: () => {} })
							return { fileId, url: remember(fileId, file) }
						},
					}
				: {})}
			resolveFile={(id) => url(id)}
			testId={`${testId}-body`}
		/>
	)
}
