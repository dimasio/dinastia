import { emptyDoc } from '@dinastia/contracts/common'
import { Button } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorFrame } from '../shared.tsx'
import type { QuestionEditorProps } from '../types.ts'
import type { matching } from './definition.ts'

export default function MatchingEditor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof matching>) {
	const { t } = useTranslation('questions')
	const { left, right } = value
	// пара — левая и правая части с общим ключом; редактор показывает их рядом
	const rightOf = (key: string) => right.find((r) => r.matchKey === key)
	const edit = (key: string, side: 'left' | 'right', body: (typeof left)[number]['body']) =>
		onChange({ ...value, [side]: value[side].map((x) => (x.matchKey === key ? { ...x, body } : x)) })
	return (
		<EditorFrame
			value={value}
			onChange={onChange}
			readOnly={readOnly}
			testId={testId}
			scoring={{ value: value.scoring, onChange: (scoring) => onChange({ ...value, scoring }) }}
		>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('matching.pairs')}</legend>
				<p className="text-muted-foreground text-xs">{t('matching.pairsHint')}</p>
				{left.map((l, i) => {
					const r = rightOf(l.matchKey)
					return (
						<div key={l.matchKey} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
							<RichTextEditor
								profile="compact"
								value={l.body}
								onChange={(body) => edit(l.matchKey, 'left', body)}
								aria-label={t('matching.left', { n: i + 1 })}
								disabled={readOnly === true}
								testId={`${testId}-left-${i}`}
								className="min-h-10"
							/>
							<RichTextEditor
								profile="compact"
								value={r?.body ?? emptyDoc()}
								onChange={(body) => edit(l.matchKey, 'right', body)}
								aria-label={t('matching.right', { n: i + 1 })}
								disabled={readOnly === true}
								testId={`${testId}-right-${i}`}
								className="min-h-10"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t('matching.remove', { n: i + 1 })}
								disabled={readOnly || left.length <= 2}
								onClick={() =>
									onChange({
										...value,
										left: left.filter((x) => x.matchKey !== l.matchKey),
										right: right.filter((x) => x.matchKey !== l.matchKey),
									})
								}
							>
								<Trash2 />
							</Button>
						</div>
					)
				})}
				<Button
					type="button"
					variant="outline"
					className="justify-self-start"
					disabled={readOnly || left.length >= 10}
					onClick={() => {
						const matchKey = crypto.randomUUID()
						onChange({
							...value,
							left: [...left, { body: emptyDoc(), matchKey }],
							right: [...right, { body: emptyDoc(), matchKey }],
						})
					}}
					data-testid={`${testId}-add-pair`}
				>
					<Plus />
					{t('matching.addPair')}
				</Button>
			</fieldset>
		</EditorFrame>
	)
}
