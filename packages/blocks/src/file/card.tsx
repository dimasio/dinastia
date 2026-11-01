import { Button } from '@dinastia/ui'
import { Download, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatSize } from '../media/upload-button.tsx'

/** Тип файла для человека: PDF, DOCX, MP3… — по расширению имени. */
const extOf = (name: string) => (name.includes('.') ? (name.split('.').pop() ?? '').toUpperCase() : '')

/** Карточка файла: значок, название, тип и размер, «Скачать» (ссылка с вложением — сервер подписал её на скачивание). */
export function FileCard(props: {
	title: string
	file: { url?: string | undefined; name: string; size: number }
	testId: string
}) {
	const { t } = useTranslation('blocks')
	const meta = [extOf(props.file.name), formatSize(props.file.size, t)].filter(Boolean).join(' · ')
	return (
		<div className="flex items-center gap-3 rounded-md border bg-card p-3" data-testid={props.testId}>
			<FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden />
			<div className="grid min-w-0 flex-1">
				<span className="truncate font-medium">{props.title}</span>
				<span className="text-muted-foreground text-xs">{meta}</span>
			</div>
			{props.file.url && (
				<Button asChild variant="outline" size="sm">
					<a href={props.file.url} rel="noopener" data-testid={`${props.testId}-download`}>
						<Download />
						{t('file.download')}
					</a>
				</Button>
			)}
		</div>
	)
}
