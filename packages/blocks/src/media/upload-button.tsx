// Загрузка файла в редакторе блока (карточка 2.7): выбор, проверка типа и размера до загрузки (лимиты BLOCK_MEDIA —
// те же у назначения на сервере), прогресс, ошибка. Саму загрузку делает страница-хост (`upload` в пропсах редактора).
import { Button } from '@dinastia/ui'
import { Upload } from 'lucide-react'
import { type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BLOCK_MEDIA, type BlockMediaKind, type BlockUpload } from '../media.ts'

/** Код ошибки запроса (oRPC — data.code) → ключ errors:… */
const codeOf = (e: unknown) => {
	const err = e as { data?: { code?: string }; code?: string } | null
	return err?.data?.code ?? err?.code ?? 'UNKNOWN'
}

/** Размер файла для человека: «2,5 МБ», «12 КБ» (строки blocks:media.size.*). */
export const formatSize = (bytes: number, t: (key: 'media.size.mb' | 'media.size.kb', o: { n: string }) => string) =>
	bytes >= 1024 * 1024
		? t('media.size.mb', { n: (Math.round((bytes / 1024 / 1024) * 10) / 10).toLocaleString('ru-RU') })
		: t('media.size.kb', { n: String(Math.max(1, Math.round(bytes / 1024))) })

export function UploadButton(props: {
	kind: BlockMediaKind
	upload: BlockUpload
	/** Загружен: fileId и локальный адрес для показа до сохранения. */
	onUploaded: (fileId: string, file: File) => void
	label: string
	/** Кнопки рядом с «Загрузить» (например, «Убрать»). */
	children?: ReactNode
	testId: string
}) {
	const { t } = useTranslation(['blocks', 'errors', 'common'])
	const id = useId()
	const input = useRef<HTMLInputElement>(null)
	const [progress, setProgress] = useState<number | null>(null)
	const [error, setError] = useState<string>()
	const limits = BLOCK_MEDIA[props.kind]

	async function pick(file: File | undefined) {
		if (!file) return
		setError(undefined)
		if (!(limits.mime as readonly string[]).includes(file.type))
			return setError(t('FILE_TYPE_NOT_ALLOWED', { ns: 'errors' }))
		if (file.size > limits.maxSize)
			return setError(t('file.tooLarge', { ns: 'common', size: Math.round(limits.maxSize / 1024 / 1024) }))
		setProgress(0)
		try {
			props.onUploaded(await props.upload(file, { kind: props.kind, onProgress: setProgress }), file)
		} catch (e) {
			setError(t(codeOf(e) as 'UNKNOWN', { ns: 'errors', defaultValue: t('UNKNOWN', { ns: 'errors' }) }))
		} finally {
			setProgress(null)
			if (input.current) input.current.value = ''
		}
	}

	return (
		<div className="grid gap-2">
			<input
				ref={input}
				id={id}
				type="file"
				accept={limits.mime.join(',')}
				className="sr-only"
				onChange={(e) => pick(e.target.files?.[0])}
				disabled={progress !== null}
				data-testid={`${props.testId}-file`}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="w-fit"
					disabled={progress !== null}
					onClick={() => input.current?.click()}
				>
					<Upload />
					{props.label}
				</Button>
				{props.children}
			</div>
			{progress !== null ? (
				<div
					role="progressbar"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={t('file.uploading', { ns: 'common' })}
					className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"
				>
					<div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
				</div>
			) : (
				<p className="text-muted-foreground text-xs">
					{t(`media.hint.${props.kind}`, { size: Math.round(limits.maxSize / 1024 / 1024) })}
				</p>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm" data-testid={`${props.testId}-error`}>
					{error}
				</p>
			)}
		</div>
	)
}

/** Адрес файла: подписанная ссылка с сервера или локальный (только что загружен, ещё не сохранён). */
export function useFileUrl(files: Readonly<Record<string, { url: string }>>) {
	const [local, setLocal] = useState<Record<string, string>>({})
	return {
		url: (fileId: string | null | undefined) => (fileId ? (files[fileId]?.url ?? local[fileId]) : undefined),
		/** Запомнить локальный адрес только что загруженного файла; вернёт его. */
		remember: (fileId: string, file: File) => {
			const local = URL.createObjectURL(file)
			setLocal((m) => ({ ...m, [fileId]: local }))
			return local
		},
	}
}
