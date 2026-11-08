import { Badge } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BlockViewerProps } from '../types.ts'
import type { assignment } from './definition.ts'

/** Формулировка и что принимается — «Как увидит ученик» в конструкторе; сдача — панель задания в плеере (3.4). */
export default function AssignmentViewer({ data, files, testId }: BlockViewerProps<typeof assignment>) {
	const { t } = useTranslation('blocks')
	return (
		<section className="grid gap-3 rounded-lg border p-4" data-testid={testId} aria-label={t('assignment.title')}>
			<h3 className="flex items-center gap-2 font-medium">
				<FileText className="size-4" aria-hidden />
				{t('assignment.title')}
			</h3>
			<RichTextView doc={data.prompt} resolveFile={(id) => files[id]?.url} />
			<ul className="flex flex-wrap gap-2 text-sm">
				{data.allowText && (
					<li>
						<Badge variant="secondary">{t('assignment.facts.text')}</Badge>
					</li>
				)}
				{data.allowFiles && (
					<li>
						<Badge variant="secondary">{t('assignment.facts.files', { count: data.maxFiles })}</Badge>
					</li>
				)}
				<li>
					<Badge variant="secondary">
						{data.requiresReview ? t('assignment.facts.review') : t('assignment.facts.noReview')}
					</Badge>
				</li>
			</ul>
		</section>
	)
}
