import { embedSrc } from '@dinastia/contracts/common'
import { Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import { EMBED_HEIGHT, type embed } from './definition.ts'
import { EmbedUrlField } from './url-field.tsx'

export default function EmbedEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof embed>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="grid gap-3">
			<EmbedUrlField
				id={`${testId}-url`}
				label={t('embed.fields.url')}
				hint={t('embed.hint')}
				value={value.url}
				valid={(u) => embedSrc(u) !== null}
				onChange={(url) => onChange({ ...value, url })}
				readOnly={readOnly}
				testId={`${testId}-url`}
			/>
			<div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
				<Field id={`${testId}-height`} label={t('embed.fields.height')}>
					<Input
						id={`${testId}-height`}
						type="number"
						min={EMBED_HEIGHT.min}
						max={EMBED_HEIGHT.max}
						step={20}
						value={value.height}
						onChange={(e) => onChange({ ...value, height: Number(e.target.value) })}
						disabled={readOnly}
						data-testid={`${testId}-height`}
					/>
				</Field>
				<Field id={`${testId}-caption`} label={t('embed.fields.caption')}>
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
		</div>
	)
}
