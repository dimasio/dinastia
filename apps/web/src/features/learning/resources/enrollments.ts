// Ученики курса (скилл admin-resource, карточки 4.1, 4.2): список с поиском, фильтрами статуса и потока, «Зачислить» (в поток),
// продление срока, отзыв и возврат доступа, перевод в другой поток. Варианты потока — из данных курса (подписи — названия). Ресурс строится на курс (список ограничен курсом) — поэтому фабрика; в реестре — образец.

import { Email } from '@dinastia/contracts/common'
import {
	ACCESS_DAYS,
	ENROLLMENT_STATUSES,
	type EnrollmentListInput,
	EnrollmentRow,
	GROUP_NONE,
} from '@dinastia/contracts/learning'
import { action, defineResource } from '@dinastia/ui/resource'
import { z } from 'zod'
import { client } from '#/app/orpc.ts'

/** Вход списка без курса (курс подставляет ресурс). */
type ListInput = Omit<z.input<typeof EnrollmentListInput>, 'courseId'>

export const EnrollForm = z.object({
	email: Email,
	name: z.string().trim().max(100).optional(),
	accessDays: ACCESS_DAYS.optional(),
	groupId: z.string().optional(),
})

const tone = (v: unknown) =>
	v === 'active' ? 'default' : v === 'revoked' ? 'destructive' : v === 'expired' ? 'secondary' : 'outline'

/** Поток курса для выбора: id и название. */
type GroupOption = { id: string; title: string }

export function enrollmentsResource(opts: { courseId: string; groups?: readonly GroupOption[] }) {
	const groups = (opts.groups ?? []).map((g) => ({ value: g.id, label: g.title }))
	const hasGroups = groups.length > 0
	return defineResource({
		key: 'enrollments',
		ns: 'learning',
		row: EnrollmentRow,
		list: (input: ListInput) => client.learning.enrollments.list({ ...input, courseId: opts.courseId }),
		perms: { read: 'learning.read', write: 'learning.enroll' },
		columns: [
			{ field: 'studentName', sort: 'studentName' },
			{ field: 'studentEmail' },
			{ field: 'groupTitle', render: (row) => row.groupTitle ?? '—' },
			{ field: 'status', render: 'badge', tone },
			{ field: 'source', render: 'badge', tone: () => 'outline' },
			{ field: 'enrolledAt', sort: 'enrolledAt', render: 'date' },
			{ field: 'expiresAt', render: 'date' },
			{ field: 'progressPct', sort: 'progressPct', render: (row) => `${row.progressPct}%` },
		],
		search: true,
		filters: [
			{ field: 'status', options: ENROLLMENT_STATUSES },
			{ field: 'groupId', options: [...groups, GROUP_NONE] },
		],
		create: {
			schema: EnrollForm,
			fields: {
				email: { hint: true },
				accessDays: { hint: true },
				name: { hint: true },
				groupId: { widget: 'select', options: groups, hint: true, visibleIf: () => hasGroups },
			},
			submit: (values) =>
				client.learning.enrollments.enroll({
					courseId: opts.courseId,
					email: values.email,
					...(values.name ? { name: values.name } : {}),
					...(values.accessDays ? { accessDays: values.accessDays } : {}),
					...(values.groupId ? { groupId: values.groupId } : {}),
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
			action({
				key: 'move',
				perm: 'learning.groups.manage',
				visible: () => hasGroups,
				form: {
					schema: z.object({ groupId: z.string() }),
					fields: { groupId: { widget: 'select', options: [...groups, GROUP_NONE] } },
					initial: (row: EnrollmentRow) => ({ groupId: row.groupId ?? GROUP_NONE }),
				},
				run: (row: EnrollmentRow, values) =>
					client.learning.enrollments.move({
						id: row.id,
						groupId: values.groupId === GROUP_NONE ? null : values.groupId,
					}),
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
