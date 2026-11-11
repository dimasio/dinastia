// Ученики школы (карточка 5.5): все ученики с числом курсов; по запросу ученика — выгрузить его данные (zip) и удалить
// их (обезличить, необратимо — подтверждение словом).
import { MEMBER_DATA_EXPORT, SchoolStudent, STUDENT_STATUSES } from '@dinastia/contracts/learning'
import { action, defineResource } from '@dinastia/ui/resource'
import { z } from 'zod'
import { runExport } from '#/app/exports.ts'
import { client } from '#/app/orpc.ts'

const CONFIRM_WORD = 'удалить'

export const studentsResource = defineResource({
	key: 'students',
	ns: 'learning',
	row: SchoolStudent,
	list: client.students.list,
	perms: { read: 'schools.members.read', write: 'schools.pd.manage' },
	columns: [
		{ field: 'name', sort: 'name' },
		{ field: 'email' },
		{ field: 'courses', render: 'number' },
		{
			field: 'status',
			render: 'badge',
			tone: (v) => (v === 'active' ? 'outline' : v === 'deleted' ? 'secondary' : 'destructive'),
		},
		{ field: 'joinedAt', sort: 'joinedAt', render: 'date' },
	],
	search: true,
	filters: [{ field: 'status', options: STUDENT_STATUSES }],
	actions: [
		{
			key: 'exportData',
			perm: 'schools.pd.manage',
			visible: (row) => row.status !== 'deleted',
			run: (row) => runExport(MEMBER_DATA_EXPORT, { memberId: row.id }),
		},
		action<SchoolStudent, z.ZodObject<{ confirm: z.ZodString }>>({
			key: 'anonymize',
			perm: 'schools.pd.manage',
			variant: 'destructive',
			visible: (row) => row.status !== 'deleted',
			form: {
				schema: z.object({
					confirm: z.string().refine((v) => v.trim().toLowerCase() === CONFIRM_WORD, 'CONFIRM_WORD'),
				}),
			},
			run: (row) => client.students.anonymize({ id: row.id }),
		}),
	],
})
