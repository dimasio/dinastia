// Вход оператора от имени участника школы (5.6г, спека ops.md §5 п. 4, решения владельца 2026-11-11): только оператор со
// вторым фактором, только пока школа разрешила доступ поддержки, только активный участник и не владелец; сессия 1 час и
// только в этой школе; опасные действия запрещены; начало и конец — в журнале школы и консоли.
import { schools } from '@dinastia/db'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { auditFor } from '../audit/audit.ts'
import { sessions, users } from '../auth/schema.ts'
import { db } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { AppError } from '../errors.ts'
import { members } from '../members/schema.ts'
import { opsAuditWrite } from './audit.ts'

export const IMPERSONATION_TTL_SECONDS = 60 * 60
export const SUPPORT_ACCESS_DAYS = 7

/**
 * Процедуры, запрещённые под сессией «от имени»: удаление школы, данные учеников (выгрузки и удаление), роли и блокировка,
 * приглашения, настройки и сам доступ поддержки, свой аватар участника.
 */
export const IMPERSONATION_FORBIDDEN: ReadonlySet<string> = new Set([
	'schools.requestDeletion',
	'schools.updateMyAvatar',
	'schools.supportAccess.set',
	'students.anonymize',
	'exports.start',
	'members.changeRole',
	'members.setStatus',
	'invitations.create',
	'settings.update',
])

/** Проверить вход от имени; вернёт пользователя-цель и куда его вести. Ошибки — коды для консоли. */
export async function checkImpersonation(operatorId: string, input: { schoolId: string; memberId: string }, now: Date) {
	const [op] = await db
		.select({ role: users.platformRole, twoFactor: users.twoFactorEnabled })
		.from(users)
		.where(eq(users.id, operatorId))
	if (op?.role !== 'operator') throw new AppError('notFound', 'NOT_FOUND')
	if (!op.twoFactor) throw new AppError('forbidden', 'OPS_2FA_REQUIRED')
	const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId))
	if (!school || school.status !== 'active') throw new AppError('notFound', 'SCHOOL_NOT_FOUND')
	if (!school.supportAccessUntil || school.supportAccessUntil <= now)
		throw new AppError('forbidden', 'SUPPORT_ACCESS_CLOSED')
	const [member] = await withTenant(school.id, (tx) =>
		tx
			.select({ userId: members.userId, role: members.role, status: members.status })
			.from(members)
			.where(eq(members.id, input.memberId)),
	)
	if (member?.status !== 'active') throw new AppError('notFound', 'MEMBER_NOT_FOUND')
	if (member.role === 'owner') throw new AppError('forbidden', 'IMPERSONATION_OWNER')
	return { school, member }
}

/** Журнал начала/конца: в школе (видит школа) и в консоли. */
export async function logImpersonation(
	kind: 'started' | 'ended',
	e: { operatorId: string; schoolId: string; memberId: string; ip: string | null },
) {
	await withTenant(e.schoolId, async (tx) => {
		await auditFor(tx, { memberId: null, operatorId: e.operatorId, ip: e.ip })(`ops.impersonation.${kind}`, {
			entity: 'member',
			id: e.memberId,
		})
		await opsAuditWrite(tx, {
			operatorId: e.operatorId,
			action: `ops.impersonation.${kind}`,
			schoolId: e.schoolId,
			target: e.memberId,
			ip: e.ip,
		})
	})
}

/** Школа закрыла доступ поддержки — сессии «от имени» в ней отзываются сразу. */
export async function revokeImpersonations(schoolId: string) {
	await db.delete(sessions).where(and(eq(sessions.impersonationSchoolId, schoolId), isNotNull(sessions.impersonatedBy)))
}

/** Сессии «от имени», ещё живые в школе (для проверок и консоли). */
export const liveImpersonations = (schoolId: string, now: Date) =>
	db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.impersonationSchoolId, schoolId), gt(sessions.expiresAt, now)))
