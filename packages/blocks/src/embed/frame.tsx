// Рамка встраивания (скилл security-baseline): только адрес из embedSrc (toPublic), iframe с sandbox, без
// передачи полного адреса страницы сервису. Видео — 16:9, встраивание — заданной высоты.
import { useTranslation } from 'react-i18next'

const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-forms'

export function EmbedFrame(props: {
	src: string | null
	title: string
	caption?: string | null | undefined
	height?: number
	testId: string
}) {
	const { t } = useTranslation('blocks')
	if (!props.src) return null
	return (
		<figure className="grid gap-2" data-testid={props.testId}>
			<div
				className="overflow-hidden rounded-lg border bg-muted"
				style={props.height ? { height: props.height } : { aspectRatio: '16 / 9' }}
			>
				<iframe
					src={props.src}
					title={props.caption || props.title}
					className="size-full"
					sandbox={SANDBOX}
					allow="fullscreen; picture-in-picture; encrypted-media"
					allowFullScreen
					loading="lazy"
					referrerPolicy="strict-origin-when-cross-origin"
					data-testid={`${props.testId}-frame`}
				/>
			</div>
			{props.caption ? <figcaption className="text-muted-foreground text-sm">{props.caption}</figcaption> : null}
			<span className="sr-only">{t('embed.external')}</span>
		</figure>
	)
}
