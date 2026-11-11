// Консоль оператора SaaS (`/ops`, 5.6, спека ops.md): только корневой домен и `platform_role = operator`; действия — со
// вторым фактором (без него — `OPS_2FA_REQUIRED`).
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id } from './common/index.ts'
import { SchoolName, SchoolSlug } from './schools.ts'

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

export const opsContract = {
	/** Кто я в консоли; не оператор — 404. */
	me: oc.route({ method: 'GET', path: '/ops/me' }).output(OpsMe),
	schools: {
		/** Создать школу и пригласить владельца письмом (регистрация — только здесь, 5.6). */
		create: oc
			.route({ method: 'POST', path: '/ops/schools', successStatus: 201 })
			.input(OpsSchoolCreate)
			.output(OpsSchoolCreated),
	},
}
