// Реестр типов вопросов (общий для сервера и клиента). Новый тип — `pnpm gen:question <type>` (маркеры gen:question).
import type { AnyQuestionDef } from './define.ts'
import { matching } from './matching/definition.ts'
import { multipleChoice } from './multiple_choice/definition.ts'
import { number } from './number/definition.ts'
import { openText } from './open_text/definition.ts'
import { ordering } from './ordering/definition.ts'
import { singleChoice } from './single_choice/definition.ts'
import { textInput } from './text_input/definition.ts'
// gen:question:import

export const questionTypes = {
	single_choice: singleChoice,
	multiple_choice: multipleChoice,
	text_input: textInput,
	number: number,
	ordering: ordering,
	matching: matching,
	open_text: openText,
	// gen:question:entry
} satisfies Record<string, AnyQuestionDef>

export type QuestionType = keyof typeof questionTypes
export const questionDef = (type: string): AnyQuestionDef | undefined =>
	(questionTypes as Record<string, AnyQuestionDef>)[type]
