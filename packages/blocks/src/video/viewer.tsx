import { useTranslation } from 'react-i18next'
import { EmbedFrame } from '../embed/frame.tsx'
import type { BlockViewerProps } from '../types.ts'
import type { video } from './definition.ts'

export default function VideoViewer({ data, testId }: BlockViewerProps<typeof video>) {
	const { t } = useTranslation('blocks')
	return <EmbedFrame src={data.src} caption={data.caption} title={t('video.title')} testId={testId} />
}
