// Загрузка картинки (скилл files-media): выбор файла, проверка типа и размера до загрузки, прогресс, удаление.
// Саму загрузку (createUpload → PUT → complete) передаёт приложение в `upload` — ui не знает про API.
import { ImagePlus, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '#/lib/utils.ts'
import { Button } from './ui/button.tsx'
import { UserAvatar } from './user-avatar.tsx'

type T = (key: string, options?: Record<string, unknown>) => string

/** image/jpeg, image/webp → «JPG, WEBP». */
const formats = (accept: readonly string[]) =>
	accept.map((m) => (m.split('/')[1] ?? m).toUpperCase().replace('JPEG', 'JPG')).join(', ')

export interface ImageInputProps {
	/** Ссылка на текущую картинку (null — нет). */
	value: string | null
	/** Для инициалов вместо картинки. */
	name: string
	accept: readonly string[]
	/** Байты — та же граница, что у назначения на сервере (сервер проверяет всё равно). */
	maxSize: number
	upload: (file: File, onProgress: (percent: number) => void) => Promise<unknown>
	onRemove?: () => Promise<unknown>
	/** Ошибка загрузки → текст для человека. */
	errorText: (error: unknown) => string
	testId: string
	className?: string
}

export function ImageInput({
	value,
	name,
	accept,
	maxSize,
	upload,
	onRemove,
	errorText,
	testId,
	className,
}: ImageInputProps) {
	const { t: raw } = useTranslation()
	const t = raw as unknown as T
	const id = useId()
	const input = useRef<HTMLInputElement>(null)
	const [progress, setProgress] = useState<number | null>(null)
	const [error, setError] = useState<string>()
	const busy = progress !== null

	async function pick(file: File | undefined) {
		if (!file) return
		setError(undefined)
		if (!accept.includes(file.type)) return setError(t('errors:FILE_TYPE_NOT_ALLOWED'))
		if (file.size > maxSize)
			return setError(t('common:file.tooLarge', { size: Math.round((maxSize / 1024 / 1024) * 10) / 10 }))
		setProgress(0)
		try {
			await upload(file, setProgress)
		} catch (err) {
			setError(errorText(err))
		} finally {
			setProgress(null)
			if (input.current) input.current.value = ''
		}
	}

	async function remove() {
		setError(undefined)
		try {
			await onRemove?.()
		} catch (err) {
			setError(errorText(err))
		}
	}

	return (
		<div className={cn('flex flex-wrap items-center gap-4', className)} data-testid={testId}>
			<UserAvatar name={name} src={value} className="size-20 text-xl" />
			<div className="grid gap-2">
				<div className="flex flex-wrap gap-2">
					<input
						ref={input}
						id={id}
						type="file"
						accept={accept.join(',')}
						className="sr-only"
						onChange={(e) => pick(e.target.files?.[0])}
						disabled={busy}
						data-testid={`${testId}-file`}
					/>
					<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
						<ImagePlus />
						{value ? t('common:file.replace') : t('common:file.upload')}
					</Button>
					{value && onRemove ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={remove}
							data-testid={`${testId}-remove`}
						>
							<Trash2 />
							{t('common:file.remove')}
						</Button>
					) : null}
				</div>
				{busy ? (
					<div
						role="progressbar"
						aria-valuenow={progress}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={t('common:file.uploading')}
						className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"
					>
						<div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
					</div>
				) : (
					<p className="text-xs text-muted-foreground">
						{t('common:file.hint', { types: formats(accept), size: Math.round((maxSize / 1024 / 1024) * 10) / 10 })}
					</p>
				)}
				{error ? (
					<p role="alert" className="text-sm text-destructive" data-testid={`${testId}-error`}>
						{error}
					</p>
				) : null}
			</div>
		</div>
	)
}
