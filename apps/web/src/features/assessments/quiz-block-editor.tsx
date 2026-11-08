// Редактор блока «Тест» в конструкторе урока (карточка 3.3): настройки и выбор вопросов из банка курса. Редакторам
// блоков API недоступен (хосты — ядро), поэтому конструктор урока подставляет этот экран вместо `BlockEditorHost`.
import {
	QUIZ_QUESTIONS_MAX,
	QUIZ_TAGS_MAX,
	QUIZ_TIME_MAX_SEC,
	QUIZ_TIME_MIN_SEC,
} from '@dinastia/contracts/assessments'
import { Badge, Button, Field, Input } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { orpc } from '#/app/orpc.ts'

/** Данные блока `quiz` в API (поля — как в `packages/blocks/src/quiz/definition.ts`). */
export interface QuizData {
	selection: 'fixed' | 'random_by_tags'
	randomCount: number
	attemptsLimit: number
	passScorePct: number
	timeLimitSec: number | null
	shuffleQuestions: boolean
	shuffleOptions: boolean
	showCorrect: 'never' | 'after_submit' | 'after_pass'
	questions: { key?: string; questionId: string }[]
	tags: { key?: string; tagId: string }[]
}

const SHOW = ['never', 'after_submit', 'after_pass'] as const

export function QuizBlockEditor(props: {
	courseId: string
	value: QuizData
	onChange: (next: QuizData) => void
	readOnly: boolean
	testId: string
}) {
	const { t } = useTranslation('assessments')
	const { courseId, readOnly, testId } = props
	// локальная копия: правки сразу видны, на сервер уходят через 0,5 с после последней
	const [value, setValue] = useState(props.value)
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const latest = useRef(props.onChange)
	latest.current = props.onChange
	useEffect(() => () => clearTimeout(timer.current), [])
	const set = (patch: Partial<QuizData>) => {
		const next = { ...value, ...patch }
		setValue(next)
		clearTimeout(timer.current)
		timer.current = setTimeout(() => latest.current(next), 500)
	}
	const num = (raw: string, fallback: number) => (raw === '' ? fallback : Number(raw))

	return (
		<div className="grid min-w-0 gap-5" data-testid={testId}>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('quizEditor.selection.label')}</legend>
				{(['fixed', 'random_by_tags'] as const).map((s) => (
					<label key={s} className="flex items-start gap-2 text-sm">
						<input
							type="radio"
							name={`${testId}-selection`}
							className="mt-1"
							checked={value.selection === s}
							disabled={readOnly}
							onChange={() => set({ selection: s })}
							data-testid={`${testId}-selection-${s}`}
						/>
						<span className="grid">
							<span>{t(`quizEditor.selection.${s}.label`)}</span>
							<span className="text-muted-foreground text-xs">{t(`quizEditor.selection.${s}.hint`)}</span>
						</span>
					</label>
				))}
			</fieldset>

			{value.selection === 'fixed' ? (
				<FixedQuestions courseId={courseId} value={value} set={set} readOnly={readOnly} testId={testId} />
			) : (
				<RandomByTags courseId={courseId} value={value} set={set} readOnly={readOnly} testId={testId} />
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field id={`${testId}-attempts`} label={t('quizEditor.attempts')} hint={t('quizEditor.attemptsHint')}>
					<Input
						id={`${testId}-attempts`}
						type="number"
						min={0}
						max={100}
						className="w-28"
						value={value.attemptsLimit}
						disabled={readOnly}
						onChange={(e) => set({ attemptsLimit: num(e.target.value, 0) })}
						data-testid={`${testId}-attempts`}
					/>
				</Field>
				<Field id={`${testId}-pass`} label={t('quizEditor.pass')} hint={t('quizEditor.passHint')}>
					<Input
						id={`${testId}-pass`}
						type="number"
						min={0}
						max={100}
						className="w-28"
						value={value.passScorePct}
						disabled={readOnly}
						onChange={(e) => set({ passScorePct: num(e.target.value, 0) })}
						data-testid={`${testId}-pass`}
					/>
				</Field>
			</div>

			<div className="grid gap-2">
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.timeLimitSec !== null}
						disabled={readOnly}
						onChange={(e) => set({ timeLimitSec: e.target.checked ? 15 * 60 : null })}
						data-testid={`${testId}-time-on`}
					/>
					{t('quizEditor.timeOn')}
				</label>
				{value.timeLimitSec !== null && (
					<Field id={`${testId}-time`} label={t('quizEditor.timeMinutes')}>
						<Input
							id={`${testId}-time`}
							type="number"
							min={QUIZ_TIME_MIN_SEC / 60}
							max={QUIZ_TIME_MAX_SEC / 60}
							className="w-28"
							value={Math.round(value.timeLimitSec / 60)}
							disabled={readOnly}
							onChange={(e) => set({ timeLimitSec: Math.max(1, num(e.target.value, 1)) * 60 })}
							data-testid={`${testId}-time`}
						/>
					</Field>
				)}
			</div>

			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('quizEditor.shuffle')}</legend>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.shuffleQuestions}
						disabled={readOnly}
						onChange={(e) => set({ shuffleQuestions: e.target.checked })}
						data-testid={`${testId}-shuffle-questions`}
					/>
					{t('quizEditor.shuffleQuestions')}
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.shuffleOptions}
						disabled={readOnly}
						onChange={(e) => set({ shuffleOptions: e.target.checked })}
						data-testid={`${testId}-shuffle-options`}
					/>
					{t('quizEditor.shuffleOptions')}
				</label>
				<p className="text-muted-foreground text-xs">{t('quizEditor.shuffleHint')}</p>
			</fieldset>

			<Field id={`${testId}-show`} label={t('quizEditor.showCorrect.label')}>
				<select
					id={`${testId}-show`}
					className="h-10 w-full rounded-md border bg-background px-2 text-sm sm:w-72"
					value={value.showCorrect}
					disabled={readOnly}
					onChange={(e) => set({ showCorrect: e.target.value as QuizData['showCorrect'] })}
					data-testid={`${testId}-show`}
				>
					{SHOW.map((s) => (
						<option key={s} value={s}>
							{t(`quizEditor.showCorrect.${s}`)}
						</option>
					))}
				</select>
			</Field>
		</div>
	)
}

type SectionProps = {
	courseId: string
	value: QuizData
	set: (patch: Partial<QuizData>) => void
	readOnly: boolean
	testId: string
}

/** Фиксированный список: выбранные вопросы (порядок, удаление) и поиск по банку для добавления. */
function FixedQuestions({ courseId, value, set, readOnly, testId }: SectionProps) {
	const { t } = useTranslation('assessments')
	const ids = value.questions.map((q) => q.questionId)
	const lookup = useQuery({
		...orpc.assessments.questions.lookup.queryOptions({ input: { ids } }),
		enabled: ids.length > 0,
		placeholderData: (prev) => prev,
	})
	const info = new Map(lookup.data?.map((r) => [r.requestedId, r.question]))
	const move = (i: number, to: number) => {
		const next = [...value.questions]
		const [item] = next.splice(i, 1)
		if (item) next.splice(to, 0, item)
		set({ questions: next })
	}
	const [picking, setPicking] = useState(false)
	return (
		<div className="grid gap-3" data-testid={`${testId}-fixed`}>
			<p className="font-medium text-sm">{t('quizEditor.questions', { count: ids.length })}</p>
			{ids.length === 0 && <p className="text-muted-foreground text-sm">{t('quizEditor.noQuestions')}</p>}
			<ol className="grid gap-2">
				{value.questions.map((q, i) => {
					const row = info.get(q.questionId)
					const missing = lookup.isSuccess && row === null
					return (
						<li
							key={q.key ?? q.questionId}
							className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
							data-testid={`${testId}-question`}
						>
							<span className="w-6 text-muted-foreground tabular-nums">{i + 1}.</span>
							<span className="min-w-0 basis-full break-words sm:basis-0 sm:flex-1">
								{missing ? <span className="text-destructive">{t('quizEditor.missing')}</span> : (row?.text ?? '…')}
							</span>
							{row && (
								<Badge variant="outline">
									{t(`questions.values.type.${row.type}` as 'questions.values.type.single_choice')}
								</Badge>
							)}
							{!readOnly && (
								<span className="flex">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('quizEditor.up', { n: i + 1 })}
										disabled={i === 0}
										onClick={() => move(i, i - 1)}
									>
										<ArrowUp />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('quizEditor.down', { n: i + 1 })}
										disabled={i === ids.length - 1}
										onClick={() => move(i, i + 1)}
									>
										<ArrowDown />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('quizEditor.remove', { n: i + 1 })}
										onClick={() => set({ questions: value.questions.filter((_, j) => j !== i) })}
										data-testid={`${testId}-question-remove`}
									>
										<Trash2 />
									</Button>
								</span>
							)}
						</li>
					)
				})}
			</ol>
			{!readOnly && (
				<>
					<Button
						type="button"
						variant="outline"
						className="justify-self-start"
						disabled={ids.length >= QUIZ_QUESTIONS_MAX}
						onClick={() => setPicking((p) => !p)}
						aria-expanded={picking}
						data-testid={`${testId}-pick`}
					>
						<Plus />
						{t('quizEditor.add')}
					</Button>
					{picking && (
						<BankPicker
							courseId={courseId}
							taken={ids}
							onAdd={(id) => set({ questions: [...value.questions, { questionId: id }] })}
							testId={`${testId}-picker`}
						/>
					)}
				</>
			)}
		</div>
	)
}

/** Поиск по банку курса: текст и тег; «Добавить» кладёт вопрос в тест. */
function BankPicker({
	courseId,
	taken,
	onAdd,
	testId,
}: {
	courseId: string
	taken: string[]
	onAdd: (id: string) => void
	testId: string
}) {
	const { t } = useTranslation('assessments')
	const [q, setQ] = useState('')
	const [tag, setTag] = useState('')
	const tags = useQuery(orpc.assessments.tags.list.queryOptions({ input: { courseId } }))
	const list = useQuery({
		...orpc.assessments.questions.list.queryOptions({
			input: { courseId, pageSize: 10, ...(q ? { q } : {}), filters: tag ? { tag } : {} },
		}),
		placeholderData: (prev) => prev,
	})
	return (
		<div className="grid gap-3 rounded-lg border p-3" data-testid={testId}>
			<div className="flex flex-wrap gap-2">
				<Input
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder={t('questions.search')}
					aria-label={t('questions.search')}
					className="min-w-0 flex-1"
					data-testid={`${testId}-search`}
				/>
				<select
					className="h-10 w-full rounded-md border bg-background px-2 text-sm sm:w-auto"
					value={tag}
					onChange={(e) => setTag(e.target.value)}
					aria-label={t('questions.fields.tag')}
					data-testid={`${testId}-tag`}
				>
					<option value="">{t('quizEditor.anyTag')}</option>
					{tags.data?.map((x) => (
						<option key={x.id} value={x.name}>
							{x.name}
						</option>
					))}
				</select>
			</div>
			{list.data && list.data.items.length === 0 && (
				<p className="text-muted-foreground text-sm">{t('quizEditor.nothingFound')}</p>
			)}
			<ul className="grid gap-2">
				{list.data?.items.map((row) => {
					const added = taken.includes(row.id)
					return (
						<li key={row.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`${testId}-row`}>
							<span className="min-w-0 basis-full break-words sm:basis-0 sm:flex-1">{row.text || '—'}</span>
							<Badge variant="outline">
								{t(`questions.values.type.${row.type}` as 'questions.values.type.single_choice')}
							</Badge>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={added}
								onClick={() => onAdd(row.id)}
								data-testid={`${testId}-add`}
							>
								{added ? t('quizEditor.added') : t('quizEditor.addOne')}
							</Button>
						</li>
					)
				})}
			</ul>
			{list.data && list.data.total > list.data.items.length && (
				<p className="text-muted-foreground text-xs">{t('quizEditor.refine', { total: list.data.total })}</p>
			)}
		</div>
	)
}

/** Случайные по тегам: теги курса (любой из выбранных) и число вопросов на попытку. */
function RandomByTags({ courseId, value, set, readOnly, testId }: SectionProps) {
	const { t } = useTranslation('assessments')
	const tags = useQuery(orpc.assessments.tags.list.queryOptions({ input: { courseId } }))
	const chosen = new Set(value.tags.map((x) => x.tagId))
	const available = (tags.data ?? []).filter((x) => chosen.has(x.id)).reduce((n, x) => n + x.count, 0)
	return (
		<div className="grid gap-3" data-testid={`${testId}-random`}>
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">{t('quizEditor.tags')}</legend>
				{tags.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('quizEditor.noTags')}</p>}
				<div className="flex flex-wrap gap-2">
					{tags.data?.map((x) => (
						<label
							key={x.id}
							className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-[:checked]:border-primary"
						>
							<input
								type="checkbox"
								checked={chosen.has(x.id)}
								disabled={readOnly || (!chosen.has(x.id) && chosen.size >= QUIZ_TAGS_MAX)}
								onChange={(e) =>
									set({
										tags: e.target.checked
											? [...value.tags, { tagId: x.id }]
											: value.tags.filter((y) => y.tagId !== x.id),
									})
								}
								data-testid={`${testId}-tag-${x.name}`}
							/>
							{x.name}
							<span className="text-muted-foreground text-xs">{x.count}</span>
						</label>
					))}
				</div>
			</fieldset>
			<Field
				id={`${testId}-count`}
				label={t('quizEditor.randomCount')}
				hint={chosen.size ? t('quizEditor.randomAvailable', { count: available }) : undefined}
			>
				<Input
					id={`${testId}-count`}
					type="number"
					min={1}
					max={QUIZ_QUESTIONS_MAX}
					className="w-28"
					value={value.randomCount}
					disabled={readOnly}
					onChange={(e) => set({ randomCount: Math.max(1, Number(e.target.value) || 1) })}
					data-testid={`${testId}-count`}
				/>
			</Field>
		</div>
	)
}
