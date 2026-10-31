// Пропсы редактора и просмотра вопроса (скилл question-types): хосты (client/) передают их компонентам типа.
import type { AnyQuestionDef, QuestionData, QuestionPublicData, QuestionResponse, QuestionReview } from './define.ts'

export interface QuestionEditorProps<Q extends AnyQuestionDef> {
	/** Полные данные вопроса (с верными ответами); у новых — заготовка defaults(). */
	value: QuestionData<Q>
	onChange: (next: QuestionData<Q>) => void
	readOnly?: boolean
	testId: string
}

export interface QuestionViewerProps<Q extends AnyQuestionDef> {
	/** Публичные данные (toPublic снимка попытки) — верных ответов здесь нет. */
	data: QuestionPublicData<Q>
	/** Ответ ученика; null — ещё не отвечал. */
	response: QuestionResponse<Q> | null
	/** Нет — только просмотр (попытка отправлена, разбор). */
	onChange?: (response: QuestionResponse<Q>) => void
	/** Разбор: передаётся, только если правило show_correct разрешает. */
	review?: QuestionReview<Q>
	testId: string
}
