// Хосты вопросов (скилл question-types): банк вопросов и попытка не знают о конкретных типах — только тип и данные.
// Редактор: локальное значение → проверка схемой (с кодом ошибки) → onChange с задержкой.
import { Alert, AlertDescription, Skeleton } from '@dinastia/ui'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clientQuestion } from '../registry.client.ts'
import { questionDef } from '../registry.ts'

export interface QuestionEditorHostProps {
	type: string
	value: unknown
	/** Проверенные схемой данные — через `delayMs` после последней правки. */
	onChange: (data: unknown) => void
	readOnly?: boolean
	delayMs?: number
	testId: string
}

const isCode = (m: string) => /^[A-Z_]+$/.test(m)

export function QuestionEditorHost({
	type,
	value,
	onChange,
	readOnly,
	delayMs = 500,
	testId,
}: QuestionEditorHostProps) {
	const { t } = useTranslation('questions')
	const def = questionDef(type)
	const client = clientQuestion(type)
	const [local, setLocal] = useState(value)
	const [errors, setErrors] = useState<string[]>([])
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const latest = useRef(onChange)
	latest.current = onChange
	useEffect(() => () => clearTimeout(timer.current), [])

	if (!def || !client) return <Unknown type={type} />
	const { Editor } = client
	return (
		<div className="grid gap-2" data-testid={testId} data-question-type={type}>
			<Suspense fallback={<Skeleton className="h-40 w-full" />}>
				<Editor
					value={local}
					readOnly={readOnly ?? false}
					testId={testId}
					onChange={(next: unknown) => {
						setLocal(next)
						const parsed = def.schema.safeParse(next)
						clearTimeout(timer.current)
						if (parsed.success) {
							setErrors([])
							timer.current = setTimeout(() => latest.current(parsed.data), delayMs)
						} else {
							// известные коды (refine типа) — понятным текстом, остальное — общая подсказка
							const codes = [...new Set(parsed.error.issues.map((i: { message: string }) => i.message).filter(isCode))]
							setErrors(
								codes.length ? codes.map((c) => t(`errors.${c}` as 'errors.NEED_ONE_CORRECT')) : [t('host.invalid')],
							)
						}
					}}
				/>
			</Suspense>
			{errors.length > 0 && (
				<Alert variant="destructive">
					<AlertDescription data-testid={`${testId}-invalid`}>{errors.join('. ')}</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

export interface QuestionViewerHostProps {
	type: string
	/** Публичные данные вопроса (toPublic) — с сервера. */
	data: unknown
	response: unknown
	onChange?: (response: unknown) => void
	/** Разбор (review) — только если правило теста разрешает. */
	review?: unknown
	testId: string
}

export function QuestionViewerHost({ type, data, response, onChange, review, testId }: QuestionViewerHostProps) {
	const client = clientQuestion(type)
	if (!client) return <Unknown type={type} />
	const { Viewer } = client
	return (
		<Suspense fallback={<Skeleton className="h-24 w-full" />}>
			<Viewer
				data={data}
				response={response}
				testId={testId}
				{...(onChange ? { onChange } : {})}
				{...(review !== undefined ? { review } : {})}
			/>
		</Suspense>
	)
}

function Unknown({ type }: { type: string }) {
	const { t } = useTranslation('questions')
	return (
		<Alert>
			<AlertDescription>{t('host.unknown', { type })}</AlertDescription>
		</Alert>
	)
}
