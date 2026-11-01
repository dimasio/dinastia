// Поле ссылки на встраивание: ошибка «нельзя встроить» — сразу у поля, список сервисов — подсказкой.
import { Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'

export function EmbedUrlField(props: {
	id: string
	label: string
	hint: string
	value: string
	valid: (url: string) => boolean
	onChange: (url: string) => void
	readOnly?: boolean | undefined
	testId: string
}) {
	const { t } = useTranslation('blocks')
	const bad = props.value.trim() !== '' && !props.valid(props.value.trim())
	return (
		<Field id={props.id} label={props.label} hint={props.hint} error={bad ? t('embed.notAllowed') : undefined}>
			<Input
				id={props.id}
				type="url"
				inputMode="url"
				value={props.value}
				maxLength={2000}
				placeholder="https://"
				aria-invalid={bad}
				onChange={(e) => props.onChange(e.target.value.trim())}
				disabled={props.readOnly}
				data-testid={props.testId}
			/>
		</Field>
	)
}
