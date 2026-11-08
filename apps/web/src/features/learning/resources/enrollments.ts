// Ученики курса (скилл admin-resource, карточка 4.1): список с поиском и фильтром статуса, «Зачислить», продление срока,
// отзыв и возврат доступа. Ресурс строится на курс (список ограничен курсом) — поэтому фабрика; в реестре — образец.

import { Email } from '@dinastia/contracts/common'
import { ACCESS_DAYS, ENROLLMENT_STATUSES, type EnrollmentListInput, EnrollmentRow } from '@dinastia/contracts/learning'
import { action, defineResource } from '@dinastia/ui/resource'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

/** Вход списка без курса (курс подставляет ресурс). */
type ListInput = Omit<z.input<typeof EnrollmentListInput>, 'courseId'>

export const EnrollForm = z.object({
	email: Email,
	name: z.string().trim().max(100).optional(),
	accessDays: ACCESS_DAYS.optional(),
})

const tone = (v: unknown) =>
	v === 'active' ? 'default' : v === 'revoked' ? 'destructive' : v === 'expired' ? 'secondary' : 'outline'

export function enrollmentsResource(opts: { courseId: string }) {
	return defineResource({
		key: 'enrollments',
		ns: 'learning',
		row: EnrollmentRow,
		list: (input: ListInput) => client.learning.enrollments.list({ ...input, courseId: opts.courseId }),
		perms: { read: 'learning.read', write: 'learning.enroll' },
		columns: [
			{ field: 'studentName', sort: 'studentName' },
			{ field: 'studentEmail' },
			{ field: 'status', render: 'badge', tone },
			{ field: 'source', render: 'badge', tone: () => 'outline' },
			{ field: 'enrolledAt', sort: 'enrolledAt', render: 'date' },
			{ field: 'expiresAt', render: 'date' },
			{ field: 'progressPct', sort: 'progressPct', render: (row) => `${row.progressPct}%` },
		],
		search: true,
		filters: [{ field: 'status', options: ENROLLMENT_STATUSES }],
		create: {
			schema: EnrollForm,
			fields: { email: { hint: true }, accessDays: { hint: true }, name: { hint: true } },
			submit: (values) =>
				client.learning.enrollments.enroll({
					courseId: opts.courseId,
					email: values.email,
					...(values.name ? { name: values.name } : {}),
					...(values.accessDays ? { accessDays: values.accessDays } : {}),
				}),
		},
		actions: [
			action({
				key: 'extend',
				visible: (row: EnrollmentRow) => row.status !== 'revoked',
				form: { schema: z.object({ accessDays: ACCESS_DAYS }), initial: () => ({ accessDays: 30 }) },
				run: (row: EnrollmentRow, values) =>
					client.learning.enrollments.extend({ id: row.id, accessDays: values.accessDays }),
			}),
			{
				key: 'unlimit',
				confirm: true,
				visible: (row) => row.status !== 'revoked' && row.expiresAt !== null,
				run: (row) => client.learning.enrollments.unlimit({ id: row.id }),
			},
			{
				key: 'revoke',
				variant: 'destructive',
				confirm: true,
				visible: (row) => row.status !== 'revoked',
				run: (row) => client.learning.enrollments.revoke({ id: row.id }),
			},
			{
				key: 'restore',
				confirm: true,
				visible: (row) => row.status === 'revoked',
				run: (row) => client.learning.enrollments.restore({ id: row.id }),
			},
		],
	})
}
