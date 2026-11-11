// Ресурсы консоли оператора (5.6б, скилл admin-resource): школы с метриками и журнал консоли. Права — признак оператора
// (`ops` во viewer лэйаута), запрещает сервер (`mw.operator2fa`).
import { OpsAuditRow, OpsSchoolCreate, OpsSchoolRow, SCHOOL_STATUSES } from '@dinastia/contracts/ops'
import { defineResource } from '@dinastia/ui/resource'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { client } from '#/app/orpc.ts'

export const opsSchoolsResource = defineResource({
	key: 'schools',
	ns: 'ops',
	row: OpsSchoolRow,
	list: client.ops.schools.list,
	perms: { read: 'ops', write: 'ops' },
	columns: [
		{
			field: 'name',
			sort: 'name',
			render: (r) => (
				<Link to="/ops/schools/$id" params={{ id: r.id }} className="font-medium underline-offset-4 hover:underline">
					{r.name}
				</Link>
			),
		},
		{
			field: 'status',
			render: 'badge',
			tone: (v) => (v === 'active' ? 'outline' : 'destructive'),
		},
		{ field: 'ownerEmail' },
		{ field: 'students', sort: 'students', render: 'number' },
		{ field: 'activeStudents30d', render: 'number' },
		{ field: 'courses', render: 'number' },
		{ field: 'lastActivityAt', sort: 'lastActivityAt', render: 'datetime' },
		{ field: 'createdAt', sort: 'createdAt', render: 'date' },
	],
	search: true,
	filters: [{ field: 'status', options: SCHOOL_STATUSES }],
	create: {
		schema: OpsSchoolCreate,
		fields: { slug: { hint: true } },
		mode: 'dialog',
		submit: (values) => client.ops.schools.create(values),
	},
})

export const opsAuditResource = defineResource({
	key: 'audit',
	ns: 'ops',
	row: OpsAuditRow,
	list: client.ops.audit.list,
	perms: { read: 'ops' },
	columns: [
		{ field: 'createdAt', sort: 'createdAt', render: 'datetime' },
		{ field: 'action', render: (r) => <ActionLabel action={r.action} /> },
		{ field: 'operatorEmail' },
		{ field: 'schoolName' },
	],
})

/** Действие журнала словами: код `ops.school.created` → ключ `ops:actions.ops-school-created` (точки — разделитель ключей i18n). */
export function ActionLabel({ action }: { action: string }) {
	const { t } = useTranslation('ops')
	return <>{t(`actions.${action.replaceAll('.', '-')}` as never, { defaultValue: action })}</>
}
