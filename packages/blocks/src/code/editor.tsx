import { Field, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import { CODE_LANGUAGES, type code } from './definition.ts'

export default function CodeEditor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof code>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="grid gap-3">
			<Field id={`${testId}-language`} label={t('code.fields.language')}>
				<Select
					value={value.language}
					onValueChange={(language) => onChange({ ...value, language: language as (typeof CODE_LANGUAGES)[number] })}
					disabled={readOnly}
				>
					<SelectTrigger id={`${testId}-language`} className="w-48" data-testid={`${testId}-language`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CODE_LANGUAGES.map((language) => (
							<SelectItem key={language} value={language}>
								{t(`code.languages.${language}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field id={`${testId}-code`} label={t('code.fields.code')}>
				<Textarea
					id={`${testId}-code`}
					value={value.code}
					maxLength={20_000}
					rows={8}
					spellCheck={false}
					className="font-mono text-sm"
					onKeyDown={(e) => {
						// Tab — отступ в коде, а не уход из поля (Shift+Tab — уйти)
						if (e.key !== 'Tab' || e.shiftKey) return
						e.preventDefault()
						const el = e.currentTarget
						const next = `${el.value.slice(0, el.selectionStart)}\t${el.value.slice(el.selectionEnd)}`
						const at = el.selectionStart + 1
						onChange({ ...value, code: next })
						requestAnimationFrame(() => el.setSelectionRange(at, at))
					}}
					onChange={(e) => onChange({ ...value, code: e.target.value })}
					disabled={readOnly}
					data-testid={`${testId}-code`}
				/>
			</Field>
		</div>
	)
}
