// Курсы (скилл admin-resource, карточка 2.1): список с поиском и фильтром по статусу, создание с описанием (rich text),
// изменение названия и адреса, архив, удаление пустого черновика. Конструктор курса — 2.2.
import { COURSE_STATUSES, CourseCreate, CourseRow, CourseSlug, CourseTitle } from '@dinastia/contracts/courses'
import { action, defineResource } from '@dinastia/ui/resource'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

const EditForm = z.object({ title: CourseTitle, slug: CourseSlug })

const tone = (status: unknown) => (status === 'published' ? 'default' : status === 'archived' ? 'secondary' : 'outline')

export const coursesResource = defineResource({
	key: 'courses',
	ns: 'courses',
	row: CourseRow,
	list: client.courses.list,
	perms: { read: 'courses.read', write: 'courses.manage' },
	columns: [
		{
			field: 'title',
			sort: 'title',
			// название — вход в конструктор курса (карточка 2.2)
			render: (row) => (
				<Link to="/admin/courses/$courseId" params={{ courseId: row.id }} className="font-medium hover:underline">
					{row.title}
				</Link>
			),
		},
		{ field: 'status', render: 'badge', tone },
		{ field: 'sectionsCount', render: 'number' },
		{ field: 'lessonsCount', render: 'number' },
		{ field: 'updatedAt', sort: 'updatedAt', render: 'date' },
	],
	search: true,
	filters: [{ field: 'status', options: COURSE_STATUSES }],
	create: {
		schema: CourseCreate,
		layout: [['title'], ['slug'], ['description']],
		fields: { slug: { hint: true } },
		submit: (values) => client.courses.create(values),
	},
	actions: [
		action<CourseRow, typeof EditForm>({
			key: 'edit',
			form: {
				// адрес меняется только у черновика: у опубликованного он уже у учеников (сервер тоже запрещает)
				schema: EditForm,
				fields: { slug: { hint: true } },
				initial: (row) => ({ title: row.title, slug: row.slug }),
			},
			run: (row, values) =>
				client.courses.update({
					id: row.id,
					title: values.title,
					...(row.status === 'draft' ? { slug: values.slug } : {}),
				}),
		}),
		{
			key: 'archive',
			confirm: true,
			visible: (row) => row.status !== 'archived',
			run: (row) => client.courses.archive({ id: row.id }),
		},
		{
			key: 'remove',
			variant: 'destructive',
			confirm: true,
			visible: (row) => row.status === 'draft' && row.lessonsCount === 0,
			run: (row) => client.courses.remove({ id: row.id }),
		},
	],
})
