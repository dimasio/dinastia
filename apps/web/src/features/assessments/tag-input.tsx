// Ввод тегов вопроса: чипы и текстовое поле с подсказками (теги курса); Enter или запятая добавляют, × убирает.
import { Badge, Input } from '@dinastia/ui'
import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

const MAX = 10
const NAME_MAX = 40

export function TagInput(props: {
	value: string[]
	onChange: (tags: string[]) => void
	suggestions: readonly string[]
	readOnly?: boolean
	testId: string
}) {
	const { t } = useTranslation('assessments')
	const listId = useId()
	const [draft, setDraft] = useState('')
	const add = (raw: string) => {
		const name = raw.trim().replace(/\s+/g, ' ')
		setDraft('')
		if (!name || props.value.length >= MAX) return
		if (props.value.some((v) => v.toLowerCase() === name.toLowerCase())) return
		props.onChange([...props.value, name.slice(0, NAME_MAX)])
	}
	return (
		<div className="grid gap-2" data-testid={props.testId}>
			{props.value.length > 0 && (
				<ul className="flex flex-wrap gap-1.5">
					{props.value.map((tag) => (
						<li key={tag}>
							<Badge variant="secondary" className="gap-1" data-testid={`${props.testId}-chip`}>
								{tag}
								{!props.readOnly && (
									<button
										type="button"
										aria-label={t('editor.tagRemove', { tag })}
										onClick={() => props.onChange(props.value.filter((v) => v !== tag))}
										className="rounded-full hover:text-destructive"
									>
										<X className="size-3" aria-hidden />
									</button>
								)}
							</Badge>
						</li>
					))}
				</ul>
			)}
			{!props.readOnly && (
				<>
					<Input
						value={draft}
						list={listId}
						maxLength={NAME_MAX}
						disabled={props.value.length >= MAX}
						placeholder={t('editor.tagPlaceholder')}
						aria-label={t('editor.tags')}
						onChange={(e) =>
							e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value)
						}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault()
								add(draft)
							}
						}}
						onBlur={() => draft && add(draft)}
						data-testid={`${props.testId}-input`}
					/>
					<datalist id={listId}>
						{props.suggestions.map((s) => (
							<option key={s} value={s} />
						))}
					</datalist>
				</>
			)}
		</div>
	)
}
