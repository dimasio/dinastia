// Клиент (apps/web): хосты вопросов; редакторы и просмотры типов грузятся лениво.
export {
	QuestionEditorHost,
	type QuestionEditorHostProps,
	QuestionViewerHost,
	type QuestionViewerHostProps,
} from './client/hosts.tsx'
export { type ClientQuestion, clientQuestion, clientQuestions, DEFAULT_QUESTION_ICON } from './registry.client.ts'
