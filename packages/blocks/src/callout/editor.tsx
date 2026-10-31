import { Field, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import { CALLOUT_TONES, type callout } from './definition.ts'

export default function CalloutEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof callout>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="grid gap-3">
			<Field id={`${testId}-tone`} label={t('callout.fields.tone')}>
				<Select
					value={value.tone}
					onValueChange={(tone) => onChange({ ...value, tone: tone as (typeof CALLOUT_TONES)[number] })}
					disabled={readOnly}
				>
					<SelectTrigger id={`${testId}-tone`} className="w-48" data-testid={`${testId}-tone`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CALLOUT_TONES.map((tone) => (
							<SelectItem key={tone} value={tone}>
								{t(`callout.tones.${tone}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id={`${testId}-body`} label={t('callout.fields.body')}>
				<RichTextEditor
					id={`${testId}-body`}
					profile="compact"
					value={value.body}
					onChange={(body) => onChange({ ...value, body })}
					placeholder={t('callout.placeholder')}
					aria-label={t('callout.fields.body')}
					disabled={readOnly === true}
					testId={`${testId}-body`}
				/>
			</Field>
		</div>
	)
}
