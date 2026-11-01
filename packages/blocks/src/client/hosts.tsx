// Хосты блоков (скилл lesson-blocks): конструктор и плеер не знают о конкретных блоках — только тип и данные.
// Редактор: локальное значение → проверка схемой → onChange с задержкой (автосохранение черновика у хоста страницы).
import { Alert, AlertDescription, Skeleton } from '@dinastia/ui'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BlockResult } from '../define.ts'
import type { BlockFiles, BlockUpload } from '../media.ts'
import { clientBlock } from '../registry.client.ts'
import { blockDef } from '../registry.ts'

export interface BlockEditorHostProps {
	type: string
	value: unknown
	/** Проверенные схемой данные — через `delayMs` после последней правки. */
	onChange: (data: unknown) => void
	readOnly?: boolean
	delayMs?: number
	/** Файлы блока (с сервера, рядом с данными). */
	files?: BlockFiles
	upload?: BlockUpload
	testId: string
}

const NO_FILES: BlockFiles = {}

export function BlockEditorHost({
	type,
	value,
	onChange,
	readOnly,
	delayMs = 500,
	files = NO_FILES,
	upload,
	testId,
}: BlockEditorHostProps) {
	const { t } = useTranslation('blocks')
	const def = blockDef(type)
	const client = clientBlock(type)
	const [local, setLocal] = useState(value)
	const [invalid, setInvalid] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const latest = useRef(onChange)
	latest.current = onChange
	useEffect(() => () => clearTimeout(timer.current), [])

	if (!def || !client) return <UnknownBlock type={type} />
	const { Editor } = client
	return (
		<div className="grid gap-2" data-testid={testId} data-block-type={type}>
			<Suspense fallback={<Skeleton className="h-24 w-full" />}>
				<Editor
					value={local}
					readOnly={readOnly ?? false}
					files={files}
					{...(upload ? { upload } : {})}
					testId={testId}
					onChange={(next: unknown) => {
						setLocal(next)
						const parsed = def.schema.safeParse(next)
						setInvalid(!parsed.success)
						clearTimeout(timer.current)
						if (parsed.success) timer.current = setTimeout(() => latest.current(parsed.data), delayMs)
					}}
				/>
			</Suspense>
			{invalid && (
				<Alert variant="destructive">
					<AlertDescription data-testid={`${testId}-invalid`}>{t('host.invalid')}</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

export interface BlockViewerHostProps {
	type: string
	/** Публичные данные (toPublic) — с сервера, из published-строк. */
	data: unknown
	state?: { result?: BlockResult | null }
	onInteract?: (response: unknown) => Promise<void>
	files?: BlockFiles
	testId: string
}

export function BlockViewerHost({ type, data, state, onInteract, files = NO_FILES, testId }: BlockViewerHostProps) {
	const client = clientBlock(type)
	if (!client) return <UnknownBlock type={type} />
	const { Viewer } = client
	return (
		<Suspense fallback={<Skeleton className="h-16 w-full" />}>
			<Viewer
				data={data}
				files={files}
				testId={testId}
				{...(state ? { state } : {})}
				{...(onInteract ? { onInteract } : {})}
			/>
		</Suspense>
	)
}

function UnknownBlock({ type }: { type: string }) {
	const { t } = useTranslation('blocks')
	return (
		<Alert>
			<AlertDescription>{t('host.unknown', { type })}</AlertDescription>
		</Alert>
	)
}
