// Реестр типов вопросов (общий для сервера и клиента). Новый тип — `pnpm gen:question <type>` (маркеры gen:question).
import type { AnyQuestionDef } from './define.ts'
import { singleChoice } from './single_choice/definition.ts'
// gen:question:import

export const questionTypes = {
	single_choice: singleChoice,
	// gen:question:entry
} satisfies Record<string, AnyQuestionDef>

export type QuestionType = keyof typeof questionTypes
export const questionDef = (type: string): AnyQuestionDef | undefined =>
	(questionTypes as Record<string, AnyQuestionDef>)[type]
