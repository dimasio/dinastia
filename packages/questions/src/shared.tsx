// Общие блоки редакторов и просмотров типов вопросов (карточка 3.2): формулировка, баллы, режим, пояснение, разбор.
import { emptyDoc, isEmptyDoc, type RichTextDoc } from '@dinastia/contracts/common'
import { Field, Input } from '@dinastia/ui'
import { RichTextEditor, RichTextView } from '@dinastia/ui/rich-text'
import type { ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

interface Common {
	prompt: RichTextDoc
	explanation: RichTextDoc | null
	points: number
}

/** Формулировка + [содержимое типа] + баллы (+ режим) + пояснение — одинаковая рамка редакторов всех типов. */
export function EditorFrame<V extends Common>(props: {
	value: V
	onChange: (next: V) => void
	readOnly: boolean | undefined
	testId: string
	/** Поля, зависящие от типа (между формулировкой и баллами). */
	children: ReactNode
	/** Режим начисления баллов — у типов с частичным баллом. */
	scoring?: { value: 'all_or_nothing' | 'partial'; onChange: (v: 'all_or_nothing' | 'partial') => void }
}) {
	const { t } = useTranslation('questions')
	const { value, onChange, readOnly, testId } = props
	return (
		<div className="grid gap-4">
			<Field id={`${testId}-prompt`} label={t('fields.prompt')}>
				<RichTextEditor
					id={`${testId}-prompt`}
					profile="lesson"
					value={value.prompt}
					onChange={(prompt) => onChange({ ...value, prompt })}
					aria-label={t('fields.prompt')}
					disabled={readOnly === true}
					testId={`${testId}-prompt`}
				/>
			</Field>
			{props.children}
			<Field id={`${testId}-points`} label={t('fields.points')}>
				<Input
					id={`${testId}-points`}
					type="number"
					min={1}
					max={100}
					className="w-24"
					value={value.points}
					disabled={readOnly}
					onChange={(e) => onChange({ ...value, points: Number(e.target.value) })}
					data-testid={`${testId}-points`}
				/>
			</Field>
			{props.scoring && <ScoringField {...props.scoring} readOnly={readOnly} testId={testId} />}
			<Field id={`${testId}-explanation`} label={t('fields.explanation')}>
				<RichTextEditor
					id={`${testId}-explanation`}
					profile="compact"
					value={value.explanation ?? emptyDoc()}
					onChange={(explanation) => onChange({ ...value, explanation: isEmptyDoc(explanation) ? null : explanation })}
					aria-label={t('fields.explanation')}
					disabled={readOnly === true}
					testId={`${testId}-explanation`}
				/>
			</Field>
		</div>
	)
}

function ScoringField(props: {
	value: 'all_or_nothing' | 'partial'
	onChange: (v: 'all_or_nothing' | 'partial') => void
	readOnly: boolean | undefined
	testId: string
}) {
	const { t } = useTranslation('questions')
	const group = useId()
	return (
		<fieldset className="grid gap-2">
			<legend className="mb-1 font-medium text-sm">{t('fields.scoring')}</legend>
			{(['all_or_nothing', 'partial'] as const).map((v) => (
				<label key={v} className="flex items-start gap-2 text-sm">
					<input
						type="radio"
						name={group}
						className="mt-1"
						checked={props.value === v}
						disabled={props.readOnly}
						onChange={() => props.onChange(v)}
						data-testid={`${props.testId}-scoring-${v}`}
					/>
					<span className="grid">
						<span>{t(`scoring.${v}.label`)}</span>
						<span className="text-muted-foreground text-xs">{t(`scoring.${v}.hint`)}</span>
					</span>
				</label>
			))}
		</fieldset>
	)
}

/** Рамка просмотра: формулировка, содержимое типа, пояснение в разборе. */
export function ViewerFrame(props: {
	prompt: RichTextDoc
	review?: { explanation: RichTextDoc | null } | undefined
	testId: string
	hint?: string | undefined
	children: ReactNode
}) {
	const { t } = useTranslation('questions')
	return (
		<fieldset className="grid gap-3" data-testid={props.testId}>
			<legend className="contents">
				<RichTextView doc={props.prompt} />
			</legend>
			{props.hint && <p className="text-muted-foreground text-xs">{props.hint}</p>}
			{props.children}
			{props.review?.explanation && !isEmptyDoc(props.review.explanation) && (
				<div className="rounded-md bg-muted p-3" data-testid={`${props.testId}-explanation`}>
					<p className="mb-1 font-medium text-sm">{t('host.explanation')}</p>
					<RichTextView doc={props.review.explanation} />
				</div>
			)}
		</fieldset>
	)
}
