// Чтение консоли оператора (5.6б): список школ — из `school_stats` (почасово), карточка — метрики считаются сейчас в транзакции
// школы; человек — по точной почте, его школы — через политику «свои членства» (`withUser`), а не обходом всех школ.

import type { OpsAuditListInput, OpsSchoolListInput } from '@dinastia/contracts/ops'
import { schools } from '@dinastia/db'
import { and, count, desc, eq, inArray, isNull, max, ne } from 'drizzle-orm'
import type { z } from 'zod'
import { sessions, users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
// biome-ignore lint/style/noRestrictedImports: консоль оператора работает вне школы (D-026): таблицы школ, метрик и журнала глобальные
import { db } from '#/kernel/db/client.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { withTenant, withUser } from '#/kernel/db/tenant.ts'
import { fail } from '#/kernel/errors.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { opsAudit } from '#/kernel/ops/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { schoolStats } from './schema.ts'
import { refreshSchoolStats } from './stats.ts'

const row = {
	id: schools.id,
	name: schools.name,
	slug: schools.slug,
	status: schools.status,
	ownerEmail: schoolStats.ownerEmail,
	students: schoolStats.students,
	activeStudents30d: schoolStats.activeStudents30d,
	courses: schoolStats.courses,
	storageBytes: schoolStats.storageBytes,
	lastActivityAt: schoolStats.lastActivityAt,
	createdAt: schools.createdAt,
}

const withDefaults = <
	T extends {
		students: number | null
		activeStudents30d: number | null
		courses: number | null
		storageBytes: number | null
	},
>(
	r: T,
) => ({
	...r,
	students: r.students ?? 0,
	activeStudents30d: r.activeStudents30d ?? 0,
	courses: r.courses ?? 0,
	storageBytes: r.storageBytes ?? 0,
})

export async function listSchools(input: z.output<typeof OpsSchoolListInput>) {
	const q = listQuery(input, {
		search: [schools.name, schools.slug, schoolStats.ownerEmail],
		sort: {
			name: schools.name,
			createdAt: schools.createdAt,
			students: schoolStats.students,
			lastActivityAt: schoolStats.lastActivityAt,
		},
		tiebreak: schools.id,
		filters: { status: schools.status },
	})
	const [items, [total]] = await Promise.all([
		db
			.select(row)
			.from(schools)
			.leftJoin(schoolStats, eq(schoolStats.schoolId, schools.id))
			.where(q.where)
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		db.select({ n: count() }).from(schools).leftJoin(schoolStats, eq(schoolStats.schoolId, schools.id)).where(q.where),
	])
	return toPage(items.map(withDefaults), total?.n ?? 0, input)
}

export async function getSchool(id: string, now: Date) {
	const [school] = await db.select().from(schools).where(eq(schools.id, id)).limit(1)
	if (!school) return fail.notFound('SCHOOL_NOT_FOUND')
	const { stats, staff } = await withTenant(school.id, async (tx) => {
		const ctx = tenantCtx(tx, school, { now: () => now, log })
		return {
			stats: await refreshSchoolStats(ctx),
			staff: await tx
				.select({ id: members.id, name: users.name, email: users.email, role: members.role, status: members.status })
				.from(members)
				.innerJoin(users, eq(users.id, members.userId))
				.where(ne(members.role, 'student'))
				.orderBy(members.joinedAt),
		}
	})
	const audit = await db
		.select({ action: opsAudit.action, operatorEmail: users.email, createdAt: opsAudit.createdAt })
		.from(opsAudit)
		.leftJoin(users, eq(users.id, opsAudit.operatorId))
		.where(eq(opsAudit.schoolId, school.id))
		.orderBy(desc(opsAudit.createdAt))
		.limit(50)
	return {
		id: school.id,
		name: school.name,
		slug: school.slug,
		status: school.status,
		createdAt: school.createdAt,
		url: appOrigin(school.slug),
		deletionRequestedAt: school.deletionRequestedAt,
		suspendedReason: school.suspendedReason,
		suspendedAt: school.suspendedAt,
		...stats,
		statsAt: now,
		staff,
		audit,
	}
}

/** Человек по точной почте; заглушки обезличенных учеников (5.5) не находятся. */
export async function findPerson(email: string) {
	const [user] = await db
		.select()
		.from(users)
		.where(and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)))
		.limit(1)
	if (!user) return null
	const [lastSession] = await db
		.select({ at: max(sessions.createdAt) })
		.from(sessions)
		.where(eq(sessions.userId, user.id))
	const memberships = await withUser(user.id, (tx) =>
		tx
			.select({ schoolId: members.schoolId, role: members.role, status: members.status })
			.from(members)
			.where(eq(members.userId, user.id)),
	)
	const ids = memberships.map((m) => m.schoolId)
	const names = ids.length
		? await db
				.select({ id: schools.id, name: schools.name, slug: schools.slug })
				.from(schools)
				.where(inArray(schools.id, ids))
		: []
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		createdAt: user.createdAt,
		lastSignInAt: lastSession?.at ?? null,
		operator: user.platformRole === 'operator',
		schools: memberships.flatMap((m) => {
			const s = names.find((n) => n.id === m.schoolId)
			return s ? [{ id: s.id, name: s.name, slug: s.slug, role: m.role, status: m.status }] : []
		}),
	}
}

export async function listAudit(input: z.output<typeof OpsAuditListInput>) {
	const q = listQuery(input, { sort: { createdAt: opsAudit.createdAt }, tiebreak: opsAudit.id })
	const [items, [total]] = await Promise.all([
		db
			.select({
				id: opsAudit.id,
				action: opsAudit.action,
				operatorEmail: users.email,
				schoolId: opsAudit.schoolId,
				schoolName: schools.name,
				createdAt: opsAudit.createdAt,
			})
			.from(opsAudit)
			.leftJoin(users, eq(users.id, opsAudit.operatorId))
			.leftJoin(schools, eq(schools.id, opsAudit.schoolId))
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		db.select({ n: count() }).from(opsAudit),
	])
	return toPage(items, total?.n ?? 0, input)
}
