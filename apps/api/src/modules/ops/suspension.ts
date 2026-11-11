// Приостановка школы оператором (5.6в, спека ops.md §4): причина обязательна; ученики и сотрудники не входят, владелец — с
// баннером; задачи школы пропускаются; письмо владельцам — задачей, выполняемой и для приостановленной школы.
import { schools } from '@dinastia/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditFor } from '#/kernel/audit/audit.ts'
import { PLATFORM } from '#/kernel/auth/magic-link-email.tsx'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { fail } from '#/kernel/errors.ts'
import { defineJob, jobsFor } from '#/kernel/jobs.ts'
import { deliverEmail } from '#/kernel/mail/send.ts'
import { members } from '#/kernel/members/schema.ts'
import { opsAuditWrite } from '#/kernel/ops/audit.ts'
import { suspensionEmail } from './emails/suspension.tsx'

export const suspensionNoticeJob = defineJob({
	name: 'ops.suspension-notice',
	schema: z.object({ kind: z.enum(['suspended', 'resumed']) }),
	// письмо о приостановке — школе, которая уже не active
	inactiveSchool: true,
	handler: async (ctx, d) => {
		const [school] = await ctx.db.select().from(schools).where(eq(schools.id, ctx.school.id)).limit(1)
		// успели вернуть обратно — письмо уже не о том
		if (!school || (d.kind === 'suspended') !== (school.status === 'suspended')) return
		const owners = await ctx.db
			.select({ email: users.email })
			.from(members)
			.innerJoin(users, eq(users.id, members.userId))
			.where(and(eq(members.role, 'owner'), eq(members.status, 'active')))
		for (const o of owners)
			await deliverEmail(PLATFORM, suspensionEmail, {
				to: o.email,
				data: {
					kind: d.kind,
					schoolName: school.name,
					reason: school.suspendedReason,
					url: `${appOrigin(school.slug)}/admin`,
				},
			})
	},
})

async function setStatus(
	operator: { id: string; ip: string | null },
	schoolId: string,
	to: 'suspended' | 'active',
	reason: string | null,
	now: Date,
) {
	return withTenant(schoolId, async (tx) => {
		const from = to === 'suspended' ? 'active' : 'suspended'
		const [row] = await tx
			.update(schools)
			.set(
				to === 'suspended'
					? { status: to, suspendedReason: reason, suspendedAt: now }
					: { status: to, suspendedReason: null, suspendedAt: null },
			)
			.where(and(eq(schools.id, schoolId), eq(schools.status, from)))
			.returning()
		if (!row) {
			const [exists] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId))
			return exists
				? fail.conflict(to === 'suspended' ? 'SCHOOL_NOT_ACTIVE' : 'SCHOOL_NOT_SUSPENDED')
				: fail.notFound('SCHOOL_NOT_FOUND')
		}
		const action = to === 'suspended' ? ('suspended' as const) : ('resumed' as const)
		// журнал школы: видно, что это сделала поддержка Dinastia (оператор — id, без ПДн)
		await auditFor(tx, { memberId: null })(`schools.school.${action}`, {
			entity: 'school',
			id: schoolId,
			diff: { operatorId: operator.id, ...(reason ? { reason } : {}) },
		})
		await opsAuditWrite(tx, { operatorId: operator.id, action: `ops.school.${action}`, schoolId, ip: operator.ip })
		await jobsFor(tx, schoolId).send(suspensionNoticeJob, { kind: action })
		return row
	})
}

export const suspendSchool = (operator: { id: string; ip: string | null }, id: string, reason: string, now: Date) =>
	setStatus(operator, id, 'suspended', reason.trim(), now)
export const resumeSchool = (operator: { id: string; ip: string | null }, id: string, now: Date) =>
	setStatus(operator, id, 'active', null, now)
