// Консоль оператора SaaS (`/ops`, 5.6, спека ops.md): только корневой домен и `platform_role = operator`; действия — со
// вторым фактором (без него — `OPS_2FA_REQUIRED`).
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id, page, pageInput } from './common/index.ts'
import { MemberRole, SchoolName, SchoolSlug } from './schools.ts'

export const OpsMe = z.object({ id: Id, email: z.string(), name: z.string(), twoFactorEnabled: z.boolean() })

export const OpsSchoolCreate = z.object({
	name: SchoolName,
	slug: SchoolSlug,
	ownerEmail: Email,
})
export type OpsSchoolCreate = z.infer<typeof OpsSchoolCreate>

export const OpsSchoolCreated = z.object({
	id: Id,
	slug: z.string(),
	name: z.string(),
	url: z.url(),
	/** До какого времени действует приглашение владельца. */
	invitationExpiresAt: DateTime,
})

// --- Школы, люди, журнал (5.6б) ---

export const SCHOOL_STATUSES = ['active', 'suspended', 'deleted'] as const
export const OpsSchoolStatus = z.enum(SCHOOL_STATUSES)

export const OpsSchoolRow = z.object({
	id: Id,
	name: z.string(),
	slug: z.string(),
	status: OpsSchoolStatus,
	ownerEmail: z.string().nullable(),
	students: z.number().int(),
	activeStudents30d: z.number().int(),
	courses: z.number().int(),
	storageBytes: z.number().int(),
	lastActivityAt: DateTime.nullable(),
	createdAt: DateTime,
})
export type OpsSchoolRow = z.infer<typeof OpsSchoolRow>

export const OpsSchoolListInput = pageInput({
	sorts: ['name', 'createdAt', 'students', 'lastActivityAt'] as const,
	defaultSort: 'createdAt',
	defaultDir: 'desc',
	filters: { status: OpsSchoolStatus },
})

export const OpsSchoolCard = OpsSchoolRow.extend({
	url: z.url(),
	deletionRequestedAt: DateTime.nullable(),
	suspendedReason: z.string().nullable(),
	/** Школа разрешила поддержке вход от имени до этого времени (5.6г). */
	supportAccessUntil: DateTime.nullable(),
	suspendedAt: DateTime.nullable(),
	/** Метрики посчитаны сейчас (не из почасовой задачи). */
	statsAt: DateTime,
	staff: z.array(z.object({ id: Id, name: z.string(), email: z.string(), role: MemberRole, status: z.string() })),
	audit: z.array(z.object({ action: z.string(), operatorEmail: z.string().nullable(), createdAt: DateTime })),
})

export const OpsPerson = z.object({
	id: Id,
	name: z.string(),
	email: z.string(),
	createdAt: DateTime,
	lastSignInAt: DateTime.nullable(),
	operator: z.boolean(),
	schools: z.array(z.object({ id: Id, name: z.string(), slug: z.string(), role: MemberRole, status: z.string() })),
})

export const OpsAuditRow = z.object({
	id: Id,
	action: z.string(),
	operatorEmail: z.string().nullable(),
	schoolId: Id.nullable(),
	schoolName: z.string().nullable(),
	createdAt: DateTime,
})

export const OpsAuditListInput = pageInput({
	sorts: ['createdAt'] as const,
	defaultSort: 'createdAt',
	defaultDir: 'desc',
})

export const opsContract = {
	/** Кто я в консоли; не оператор — 404. */
	me: oc.route({ method: 'GET', path: '/ops/me' }).output(OpsMe),
	schools: {
		list: oc.route({ method: 'GET', path: '/ops/schools' }).input(OpsSchoolListInput).output(page(OpsSchoolRow)),
		/** Карточка школы: метрики считаются сейчас, сотрудники, действия консоли по школе. */
		get: oc
			.route({ method: 'GET', path: '/ops/schools/{id}' })
			.input(z.object({ id: Id }))
			.output(OpsSchoolCard),
		/** Приостановить: ученики и сотрудники не входят, владелец — с баннером; причина видна владельцу и в письме. */
		suspend: oc
			.route({ method: 'POST', path: '/ops/schools/{id}/suspend' })
			.input(z.object({ id: Id, reason: z.string().trim().min(3).max(500) }))
			.output(OpsSchoolCard),
		resume: oc
			.route({ method: 'POST', path: '/ops/schools/{id}/resume' })
			.input(z.object({ id: Id }))
			.output(OpsSchoolCard),
		/** Создать школу и пригласить владельца письмом (регистрация — только здесь, 5.6). */
		create: oc
			.route({ method: 'POST', path: '/ops/schools', successStatus: 201 })
			.input(OpsSchoolCreate)
			.output(OpsSchoolCreated),
	},
	people: {
		/** Человек по точной почте (не перебор): его школы и роли; в журнал консоли. Не найден — null. */
		find: oc
			.route({ method: 'POST', path: '/ops/people/find' })
			.input(z.object({ email: Email }))
			.output(OpsPerson.nullable()),
	},
	audit: {
		list: oc.route({ method: 'GET', path: '/ops/audit' }).input(OpsAuditListInput).output(page(OpsAuditRow)),
	},
}
