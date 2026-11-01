import { useTranslation } from 'react-i18next'
import type { BlockViewerProps } from '../types.ts'
import type { embed } from './definition.ts'
import { EmbedFrame } from './frame.tsx'

export default function EmbedViewer({ data, testId }: BlockViewerProps<typeof embed>) {
	const { t } = useTranslation('blocks')
	return (
		<EmbedFrame src={data.src} caption={data.caption} height={data.height} title={t('embed.title')} testId={testId} />
	)
}
