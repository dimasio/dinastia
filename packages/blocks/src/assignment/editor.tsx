import { ASSIGNMENT_MAX_FILES } from '@dinastia/contracts/assessments'
import { Field, Input } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import { useFileUrl } from '../media/upload-button.tsx'
import type { BlockEditorProps } from '../types.ts'
import type { assignment } from './definition.ts'

export default function AssignmentEditor({
	value,
	onChange,
	readOnly,
	files,
	upload,
	testId,
}: BlockEditorProps<typeof assignment>) {
	const { t } = useTranslation('blocks')
	const { url, remember } = useFileUrl(files)
	return (
		<div className="grid gap-4">
			<Field id={`${testId}-prompt`} label={t('assignment.fields.prompt')}>
				<RichTextEditor
					id={`${testId}-prompt`}
					profile="lesson"
					value={value.prompt}
					onChange={(prompt) => onChange({ ...value, prompt })}
					placeholder={t('assignment.placeholder')}
					aria-label={t('assignment.fields.prompt')}
					disabled={readOnly === true}
					{...(upload && !readOnly
						? {
								uploadImage: async (file: File) => {
									const fileId = await upload(file, { kind: 'image', onProgress: () => {} })
									return { fileId, url: remember(fileId, file) }
								},
							}
						: {})}
					resolveFile={(id) => url(id)}
					testId={`${testId}-prompt`}
				/>
			</Field>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('assignment.fields.accept')}</legend>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.allowText}
						disabled={readOnly}
						onChange={(e) => onChange({ ...value, allowText: e.target.checked })}
						data-testid={`${testId}-allow-text`}
					/>
					{t('assignment.fields.allowText')}
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.allowFiles}
						disabled={readOnly}
						onChange={(e) => onChange({ ...value, allowFiles: e.target.checked })}
						data-testid={`${testId}-allow-files`}
					/>
					{t('assignment.fields.allowFiles')}
				</label>
			</fieldset>
			{value.allowFiles && (
				<Field
					id={`${testId}-max-files`}
					label={t('assignment.fields.maxFiles')}
					hint={t('assignment.maxFilesHint', { max: ASSIGNMENT_MAX_FILES })}
				>
					<Input
						id={`${testId}-max-files`}
						type="number"
						min={1}
						max={ASSIGNMENT_MAX_FILES}
						className="w-28"
						value={value.maxFiles}
						disabled={readOnly}
						onChange={(e) =>
							onChange({ ...value, maxFiles: Math.min(ASSIGNMENT_MAX_FILES, Math.max(1, Number(e.target.value) || 1)) })
						}
						data-testid={`${testId}-max-files`}
					/>
				</Field>
			)}
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={value.requiresReview}
					disabled={readOnly}
					onChange={(e) => onChange({ ...value, requiresReview: e.target.checked })}
					data-testid={`${testId}-requires-review`}
				/>
				{t('assignment.fields.requiresReview')}
			</label>
			<p className="text-muted-foreground text-xs">{t('assignment.reviewHint')}</p>
		</div>
	)
}
