import { Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import { HEADING_LEVELS, type heading } from './definition.ts'

export default function HeadingEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof heading>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
			<Field id={`${testId}-level`} label={t('heading.fields.level')}>
				<Select
					value={value.level}
					onValueChange={(level) => onChange({ ...value, level: level as (typeof HEADING_LEVELS)[number] })}
					disabled={readOnly}
				>
					<SelectTrigger id={`${testId}-level`} className="w-full" data-testid={`${testId}-level`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{HEADING_LEVELS.map((level) => (
							<SelectItem key={level} value={level}>
								{t(`heading.levels.${level}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id={`${testId}-text`} label={t('heading.fields.text')}>
				<Input
					id={`${testId}-text`}
					value={value.text}
					maxLength={200}
					placeholder={t('heading.placeholder')}
					onChange={(e) => onChange({ ...value, text: e.target.value })}
					disabled={readOnly}
					data-testid={`${testId}-text`}
				/>
			</Field>
		</div>
	)
}
