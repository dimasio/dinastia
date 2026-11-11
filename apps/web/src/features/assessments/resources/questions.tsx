// Банк вопросов курса (скилл admin-resource, карточка 3.1): список с поиском и фильтрами «тип» и «тег», действие «В архив».
// Ресурс строится на курс (список ограничен курсом) и его теги — поэтому фабрика; в реестре ресурсов — пустой образец.
import { type QuestionListInput, QuestionRow } from '@dinastia/contracts/assessments'
import { questionTypes } from '@dinastia/questions'
import { Badge } from '@dinastia/ui'
import { defineResource } from '@dinastia/ui/resource'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

const TYPES = Object.keys(questionTypes) as [string, ...string[]]
/** Вход списка без курса (курс подставляет ресурс). */
type ListInput = Omit<z.input<typeof QuestionListInput>, 'courseId'>

export const NewQuestionForm = z.object({ type: z.enum(TYPES) })

export function questionsResource(opts: {
	courseId: string
	tags: readonly string[]
	/** Выбран тип нового вопроса — открыть редактор. */
	onCreate: (type: string) => void
}) {
	return defineResource({
		key: 'questions',
		ns: 'assessments',
		scope: opts.courseId,
		row: QuestionRow,
		list: (input: ListInput) => client.assessments.questions.list({ ...input, courseId: opts.courseId }),
		perms: { read: 'assessments.bank.read', write: 'assessments.bank.manage' },
		columns: [
			{
				field: 'text',
				render: (row) => (
					<Link
						to="/admin/courses/$courseId/questions/$questionId"
						params={{ courseId: opts.courseId, questionId: row.id }}
						search={{}}
						className="font-medium hover:underline"
					>
						{row.text || '—'}
					</Link>
				),
			},
			{ field: 'type', render: 'badge', tone: () => 'outline' },
			{ field: 'points', sort: 'points', render: 'number' },
			{
				field: 'tags',
				render: (row) => (
					<span className="flex flex-wrap gap-1">
						{row.tags.map((t) => (
							<Badge key={t} variant="secondary">
								{t}
							</Badge>
						))}
					</span>
				),
			},
			{ field: 'updatedAt', sort: 'updatedAt', render: 'date' },
		],
		search: true,
		filters: [
			{ field: 'type', options: TYPES },
			...(opts.tags.length ? [{ field: 'tag' as const, options: opts.tags }] : []),
		],
		create: {
			schema: NewQuestionForm,
			initial: { type: TYPES[0] },
			submit: async (values) => opts.onCreate(values.type),
		},
		actions: [
			{
				key: 'archive',
				confirm: true,
				run: (row) => client.assessments.questions.archive({ id: row.id }),
			},
		],
	})
}
