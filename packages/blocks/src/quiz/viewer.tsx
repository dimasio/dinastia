import { Badge } from '@dinastia/ui'
import { ClipboardCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BlockViewerProps } from '../types.ts'
import type { quiz } from './definition.ts'

/** Карточка теста с настройками — «Как увидит ученик» в конструкторе; прохождение — панель теста в плеере (3.3). */
export default function QuizViewer({ data, testId }: BlockViewerProps<typeof quiz>) {
	const { t } = useTranslation('blocks')
	return (
		<section className="grid gap-3 rounded-lg border p-4" data-testid={testId} aria-label={t('quiz.title')}>
			<h3 className="flex items-center gap-2 font-medium">
				<ClipboardCheck className="size-4" aria-hidden />
				{t('quiz.title')}
			</h3>
			<ul className="flex flex-wrap gap-2 text-sm">
				<li>
					<Badge variant="secondary">{t('quiz.facts.questions', { count: data.questionsCount })}</Badge>
				</li>
				<li>
					<Badge variant="secondary">{t('quiz.facts.pass', { pct: data.passScorePct })}</Badge>
				</li>
				<li>
					<Badge variant="secondary">
						{data.timeLimitSec === null
							? t('quiz.facts.noTime')
							: t('quiz.facts.time', { minutes: Math.round(data.timeLimitSec / 60) })}
					</Badge>
				</li>
				<li>
					<Badge variant="secondary">
						{data.attemptsLimit === 0
							? t('quiz.facts.attemptsUnlimited')
							: t('quiz.facts.attempts', { count: data.attemptsLimit })}
					</Badge>
				</li>
			</ul>
		</section>
	)
}
