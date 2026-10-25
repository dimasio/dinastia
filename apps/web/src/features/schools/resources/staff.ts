// Сотрудники школы (скилл admin-resource): список, приглашение, смена роли, блокировка.
import { MEMBER_STATUSES, STAFF_ROLES, StaffInvite, StaffInviteRole, StaffMember } from '@dinastia/contracts/schools'
import { action, defineResource } from '@dinastia/ui/resource'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

const manageable = (row: StaffMember, viewer: { memberId: string; role: string }) =>
	row.role !== 'owner' && row.id !== viewer.memberId && (row.role !== 'admin' || viewer.role === 'owner')

export const staffResource = defineResource({
	key: 'staff',
	ns: 'schools',
	row: StaffMember,
	list: client.members.list,
	perms: { read: 'schools.members.read', write: 'schools.members.manage' },
	columns: [
		{ field: 'name', sort: 'name', avatar: 'avatarUrl' },
		{ field: 'email' },
		{ field: 'role', sort: 'role', render: 'badge', labels: 'common:roles' },
		{
			field: 'status',
			render: 'badge',
			tone: (v) => (v === 'blocked' ? 'destructive' : 'outline'),
		},
		{ field: 'joinedAt', sort: 'joinedAt', render: 'date' },
	],
	search: true,
	filters: [
		{ field: 'role', options: STAFF_ROLES, labels: 'common:roles' },
		{ field: 'status', options: MEMBER_STATUSES },
	],
	create: {
		schema: StaffInvite,
		fields: { role: { labels: 'common:roles' } },
		initial: { role: 'teacher' },
		submit: (values) => client.invitations.create(values),
	},
	actions: [
		action({
			key: 'changeRole',
			visible: manageable,
			form: {
				schema: z.object({ role: StaffInviteRole }),
				fields: { role: { labels: 'common:roles' } },
				initial: (row) => (row.role === 'owner' || row.role === 'student' ? {} : { role: row.role }),
			},
			run: (row, values) => client.members.changeRole({ id: row.id, role: values.role }),
		}),
		{
			key: 'block',
			variant: 'destructive',
			confirm: true,
			visible: (row, viewer) => row.status === 'active' && manageable(row, viewer),
			run: (row) => client.members.setStatus({ id: row.id, status: 'blocked' }),
		},
		{
			key: 'unblock',
			confirm: true,
			visible: (row, viewer) => row.status === 'blocked' && manageable(row, viewer),
			run: (row) => client.members.setStatus({ id: row.id, status: 'active' }),
		},
	],
})
