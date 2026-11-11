// Консоль оператора SaaS (5.6, спека ops.md): процедуры `ops.*` — корневой домен, `mw.operator`; действия — `mw.operator2fa`.

import { eq } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
// biome-ignore lint/style/noRestrictedImports: консоль оператора работает вне школы (D-026): свои данные оператора и создание школы
import { db } from '#/kernel/db/client.ts'
import { opsAuditWrite } from '#/kernel/ops/audit.ts'
import { impl, mw } from '#/kernel/orpc.ts'
import { rateLimit } from '#/kernel/rate-limit/rate-limit.ts'
import { createSchoolByOperator } from '../schools/service.ts'
import { findPerson, getSchool, listAudit, listSchools } from './service.ts'

export const opsRouter = {
	me: impl.ops.me
		.use(mw.host)
		.use(mw.session)
		.use(mw.operator)
		.handler(async ({ context }) => {
			const [u] = await db.select().from(users).where(eq(users.id, context.user.id)).limit(1)
			return {
				id: context.user.id,
				email: context.user.email,
				name: u?.name ?? context.user.name,
				twoFactorEnabled: context.operator.twoFactorEnabled,
			}
		}),

	schools: {
		list: impl.ops.schools.list
			.use(mw.host)
			.use(mw.session)
			.use(mw.operator)
			.use(mw.operator2fa)
			.handler(({ input }) => listSchools(input)),
		get: impl.ops.schools.get
			.use(mw.host)
			.use(mw.session)
			.use(mw.operator)
			.use(mw.operator2fa)
			.handler(({ input, context }) => getSchool(input.id, context.now())),
		create: impl.ops.schools.create
			.use(mw.host)
			.use(mw.session)
			.use(mw.operator)
			.use(mw.operator2fa)
			.use(rateLimit({ name: 'ops.schools.create', max: 30, windowSeconds: 3600, by: 'user' }))
			.handler(async ({ input, context }) => {
				const { school, invitation } = await createSchoolByOperator(input, context.operator.id)
				// почта владельца — ПДн: в журнале только id школы и приглашения
				await opsAuditWrite(db, {
					operatorId: context.operator.id,
					action: 'ops.school.created',
					schoolId: school.id,
					target: invitation.id,
					ip: context.ip,
				})
				return {
					id: school.id,
					slug: school.slug,
					name: school.name,
					url: appOrigin(school.slug),
					invitationExpiresAt: invitation.expiresAt,
				}
			}),
	},
	people: {
		find: impl.ops.people.find
			.use(mw.host)
			.use(mw.session)
			.use(mw.operator)
			.use(mw.operator2fa)
			.use(rateLimit({ name: 'ops.people.find', max: 60, windowSeconds: 600, by: 'user' }))
			.handler(async ({ input, context }) => {
				const person = await findPerson(input.email)
				// почта — ПДн: в журнале только id найденного
				await opsAuditWrite(db, {
					operatorId: context.operator.id,
					action: 'ops.person.searched',
					target: person?.id ?? null,
					ip: context.ip,
				})
				return person
			}),
	},
	audit: {
		list: impl.ops.audit.list
			.use(mw.host)
			.use(mw.session)
			.use(mw.operator)
			.use(mw.operator2fa)
			.handler(({ input }) => listAudit(input)),
	},
}
