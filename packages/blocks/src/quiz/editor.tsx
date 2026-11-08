import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import type { quiz } from './definition.ts'

/**
 * Запасной редактор теста: настройки и выбор вопросов нужны запросы к банку курса, а редакторам блоков API недоступен, —
 * поэтому в конструкторе урока блок «Тест» редактирует экран `features/assessments/quiz-block-editor.tsx` (карточка 3.3).
 */
export default function QuizEditor({ value, testId }: BlockEditorProps<typeof quiz>) {
	const { t } = useTranslation('blocks')
	return (
		<p className="text-muted-foreground text-sm" data-testid={testId}>
			{t('quiz.editorHint', { count: value.questions.length })}
		</p>
	)
}
