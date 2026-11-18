import { useTranslation } from 'react-i18next'
import { EmbedFrame } from '../embed/frame.tsx'
import type { BlockViewerProps } from '../types.ts'
import type { video } from './definition.ts'

export default function VideoViewer({ data, files, testId }: BlockViewerProps<typeof video>) {
	const { t } = useTranslation('blocks')
	const file = data.fileId ? files[data.fileId] : undefined
	// видео из хранилища школы (D-070) — встроенный плеер браузера, без кнопки скачивания
	if (file)
		return (
			<figure className="grid gap-2" data-testid={testId}>
				{/* biome-ignore lint/a11y/useMediaCaption: субтитров у загруженного видео нет */}
				<video
					src={file.url}
					controls
					controlsList="nodownload"
					disablePictureInPicture
					preload="metadata"
					onContextMenu={(e) => e.preventDefault()}
					className="aspect-video w-full rounded-lg bg-black"
					aria-label={data.caption ?? t('video.title')}
					data-testid={`${testId}-video`}
				/>
				{data.caption && <figcaption className="text-muted-foreground text-sm">{data.caption}</figcaption>}
			</figure>
		)
	return <EmbedFrame src={data.src} caption={data.caption} title={t('video.title')} testId={testId} />
}
