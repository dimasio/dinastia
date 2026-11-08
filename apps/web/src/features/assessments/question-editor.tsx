// Экран вопроса банка (карточка 3.1): тип, редактор типа, теги, явное «Сохранить», «Как увидит ученик».
// Редактор типа — из реестра (clientQuestion): проверку схемой делаем здесь, чтобы знать, можно ли сохранять.
import { questionDef, questionTypes } from '@dinastia/questions'
import { clientQuestion, QuestionViewerHost } from '@dinastia/questions/client'
import {
	Alert,
	AlertDescription,
	Button,
	EmptyState,
	Field,
	PageHeader,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	toast,
} from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CircleHelp, Eye } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { TagInput } from './tag-input.tsx'
import { withTempIds } from './temp-ids.ts'

const isCode = (m: string) => /^[A-Z_]+$/.test(m)

export function QuestionEditorPage(props: { courseId: string; questionId: string; type?: string | undefined }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const isNew = props.questionId === 'new'
	const existing = useQuery({
		...orpc.assessments.questions.get.queryOptions({ input: { id: props.questionId } }),
		enabled: !isNew,
		// форма держит своё состояние — фоновые обновления её не затирают
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
	})
	const back = (
		<Link
			to="/admin/courses/$courseId/questions"
			params={{ courseId: props.courseId }}
			className="mb-4 flex w-fit items-center gap-1 text-muted-foreground text-sm hover:underline"
			data-testid="question-back"
		>
			<ArrowLeft className="size-4" aria-hidden />
			{t('editor.back')}
		</Link>
	)
	if (!isNew && existing.isPending) return <Skeleton className="h-64 w-full" />
	if (!isNew && existing.error)
		return (
			<>
				{back}
				<EmptyState icon={CircleHelp} title={t(errorText(existing.error), { ns: 'errors' })} />
			</>
		)
	return (
		<>
			{back}
			<EditorForm
				courseId={props.courseId}
				id={isNew ? null : props.questionId}
				initialType={existing.data?.type ?? props.type ?? null}
				initialData={existing.data?.data ?? null}
				initialTags={existing.data?.tags ?? []}
			/>
		</>
	)
}

function EditorForm(props: {
	courseId: string
	id: string | null
	initialType: string | null
	initialData: Record<string, unknown> | null
	initialTags: string[]
}) {
	const { t } = useTranslation(['assessments', 'errors', 'questions'])
	const qc = useQueryClient()
	const navigate = useNavigate()
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('assessments.bank.manage') ?? false
	const tagsQuery = useQuery(orpc.assessments.tags.list.queryOptions({ input: { courseId: props.courseId } }))

	const [type, setType] = useState<string>(props.initialType ?? Object.keys(questionTypes)[0] ?? '')
	const def = questionDef(type)
	const client = clientQuestion(type)
	const [value, setValue] = useState<unknown>(() => props.initialData ?? def?.defaults() ?? {})
	const [tags, setTags] = useState<string[]>(props.initialTags)
	const [saved, setSaved] = useState(() => JSON.stringify([props.initialData, props.initialTags]))
	const [preview, setPreview] = useState(false)
	const [response, setResponse] = useState<unknown>(null)

	const parsed = def?.schema.safeParse(value)
	const codes =
		parsed && !parsed.success
			? [...new Set(parsed.error.issues.map((i: { message: string }) => i.message).filter(isCode))]
			: []
	const dirty = JSON.stringify([parsed?.success ? parsed.data : value, tags]) !== saved
	const valid = Boolean(parsed?.success)
	const previewData = useMemo(
		() => (parsed?.success ? withTempIds(parsed.data as Record<string, unknown>) : null),
		[parsed?.success, value],
	)

	useBlocker({
		shouldBlockFn: () => dirty && canManage && !window.confirm(t('editor.leave')),
		enableBeforeUnload: () => dirty && canManage,
	})
	// новый тип — заготовка этого типа (только у нового вопроса)
	useEffect(() => {
		if (props.id === null) setValue(questionDef(type)?.defaults() ?? {})
	}, [type, props.id])

	const refresh = () => {
		qc.invalidateQueries({ queryKey: ['resource', 'questions'] })
		qc.invalidateQueries({
			queryKey: orpc.assessments.tags.list.queryOptions({ input: { courseId: props.courseId } }).queryKey,
		})
	}
	const save = useMutation({
		mutationFn: async () => {
			const data = parsed?.success ? (parsed.data as Record<string, unknown>) : {}
			return props.id
				? orpc.assessments.questions.update.call({ id: props.id, data, tags })
				: orpc.assessments.questions.create.call({ courseId: props.courseId, type, data, tags })
		},
		onSuccess: (q) => {
			refresh()
			toast.success(t('editor.saved'))
			setSaved(JSON.stringify([parsed?.success ? parsed.data : value, tags]))
			if (!props.id)
				// после создания — в список (флаг сохранённого уже снят, блокировка не сработает)
				setTimeout(
					() => navigate({ to: '/admin/courses/$courseId/questions', params: { courseId: props.courseId } }),
					0,
				)
			else setValue(q.data)
		},
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})

	if (!def || !client) return <EmptyState icon={CircleHelp} title={t('editor.unknownType', { type })} />
	const { Editor } = client
	return (
		<div className="grid max-w-3xl gap-6" data-testid="question-editor">
			<PageHeader title={props.id ? t('editor.titleEdit') : t('editor.titleNew')} />
			<Field id="question-type" label={t('editor.type')}>
				{props.id || !canManage ? (
					<p className="text-sm" data-testid="question-type">
						{t(`${type}.title` as 'single_choice.title', { ns: 'questions' })}
					</p>
				) : (
					<Select value={type} onValueChange={setType}>
						<SelectTrigger id="question-type" className="w-full sm:w-72" data-testid="question-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(questionTypes).map((k) => (
								<SelectItem key={k} value={k}>
									{t(`${k}.title` as 'single_choice.title', { ns: 'questions' })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</Field>

			<Suspense fallback={<Skeleton className="h-40 w-full" />}>
				<Editor value={value} readOnly={!canManage} testId="question" onChange={setValue} />
			</Suspense>
			{canManage && !valid && (
				<Alert variant="destructive">
					<AlertDescription data-testid="question-invalid">
						{codes.length
							? codes.map((c) => t(`errors.${c}` as 'errors.NEED_ONE_CORRECT', { ns: 'questions' })).join('. ')
							: t('editor.invalid')}
					</AlertDescription>
				</Alert>
			)}

			<Field id="question-tags" label={t('editor.tags')} hint={t('editor.tagsHint')}>
				<TagInput
					value={tags}
					onChange={setTags}
					suggestions={tagsQuery.data?.map((x) => x.name) ?? []}
					readOnly={!canManage}
					testId="question-tags"
				/>
			</Field>

			<div className="flex flex-wrap gap-2">
				{canManage && (
					<Button
						onClick={() => save.mutate()}
						disabled={!valid || !dirty || save.isPending}
						data-testid="question-save"
					>
						{t('editor.save')}
					</Button>
				)}
				<Button
					variant="outline"
					disabled={!valid}
					onClick={() => setPreview((p) => !p)}
					aria-pressed={preview}
					data-testid="question-preview-toggle"
				>
					<Eye />
					{t('editor.preview')}
				</Button>
			</div>

			{preview && previewData && (
				<section
					className="grid gap-2 rounded-lg border p-4"
					aria-label={t('editor.preview')}
					data-testid="question-preview"
				>
					<QuestionViewerHost
						type={type}
						data={def.toPublic(previewData)}
						response={response}
						onChange={setResponse}
						testId="question-preview-view"
					/>
				</section>
			)}
		</div>
	)
}
