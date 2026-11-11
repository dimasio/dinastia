// Школа и участники (скилл lms-school). Создание школы — до появления тенанта, поэтому вне SchoolCtx.

import { createHash, randomBytes } from 'node:crypto'
import { type SchoolCreate, SchoolCreate as SchoolCreateSchema } from '@dinastia/contracts/schools'
import { schools } from '@dinastia/db'
import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import { consents } from '#/kernel/auth/schema.ts'
import type { Tx } from '#/kernel/context.ts'
// biome-ignore lint/style/noRestrictedImports: регистрация школы и поиск школы по slug идут до появления тенанта (D-006)
import { db } from '#/kernel/db/client.ts'
import { withUser } from '#/kernel/db/tenant.ts'
import { fail } from '#/kernel/errors.ts'
import { LEGAL_VERSIONS } from '#/kernel/legal.ts'
import { sendInvitationJob } from './jobs.ts'
import { invitations } from './schema.ts'

/** Приглашение владельца созданной школы живёт дольше сотрудника: школу создают заранее. */
const OWNER_INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000

import { jobsFor } from '#/kernel/jobs.ts'
import { members } from '#/kernel/members/schema.ts'
import { deleteAtOf } from '#/kernel/school-deletion/school-deletion.ts'

/** Школа сразу с владельцем и его согласиями — для сида, тестов и CLI разработки (`src/create-school.ts`); в продукте школы
 * создаёт оператор (`createSchoolByOperator`, 5.6). */
export async function createSchool(input: SchoolCreate, owner: { userId: string; ip?: string | null }) {
	const data = SchoolCreateSchema.parse(input)
	return db.transaction(async (tx) => {
		const [school] = await tx
			.insert(schools)
			.values({ name: data.name, slug: data.slug })
			.onConflictDoNothing({ target: schools.slug })
			.returning()
		if (!school) return fail.conflict('SLUG_TAKEN', { slug: data.slug })

		await tx.execute(sql`select set_config('app.school_id', ${school.id}, true)`)
		const [member] = await tx.insert(members).values({ userId: owner.userId, role: 'owner' }).returning()
		if (!member) throw new Error('владелец не создан')
		await recordOwnerConsents(tx, { userId: owner.userId, schoolId: school.id, ip: owner.ip ?? null })
		return { school, member }
	})
}

/**
 * Создать школу оператором (5.6, регистрация — только через консоль): школа без участников + приглашение владельца (роль
 * `owner`, приглашает Dinastia) — письмо уходит задачей; владелец принимает оферту и политику, принимая приглашение.
 */
export async function createSchoolByOperator(input: SchoolCreate & { ownerEmail: string }, operatorId: string) {
	const data = SchoolCreateSchema.parse(input)
	const email = input.ownerEmail.trim().toLowerCase()
	return db.transaction(async (tx) => {
		const [school] = await tx
			.insert(schools)
			.values({ name: data.name, slug: data.slug, createdByOperatorId: operatorId })
			.onConflictDoNothing({ target: schools.slug })
			.returning()
		if (!school) return fail.conflict('SLUG_TAKEN', { slug: data.slug })
		await tx.execute(sql`select set_config('app.school_id', ${school.id}, true)`)
		const [invitation] = await tx
			.insert(invitations)
			.values({
				email,
				role: 'owner',
				// заглушка: токен выпускает задача письма (как у приглашений сотрудников)
				tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
				invitedBy: null,
				expiresAt: new Date(Date.now() + OWNER_INVITATION_TTL_MS),
			})
			.returning()
		if (!invitation) throw new Error('приглашение владельца не создано')
		await jobsFor(tx, school.id).send(sendInvitationJob, { invitationId: invitation.id })
		return { school, invitation }
	})
}

/** Согласия владельца с офертой и политикой Dinastia — при регистрации (сид) и принятии приглашения владельца (5.6). */
export async function recordOwnerConsents(tx: Tx, input: { userId: string; schoolId: string; ip: string | null }) {
	await tx.insert(consents).values([
		{ ...input, kind: 'offer', version: LEGAL_VERSIONS.offer },
		{ ...input, kind: 'privacy', version: LEGAL_VERSIONS.privacy },
	])
}

/** Школы, где пользователь — активный участник (корневой домен: выбор школы); владелец видит и удаляемые (5.5). */
export async function listMySchools(userId: string) {
	const rows = await withUser(userId, (tx) =>
		tx
			.select({
				id: schools.id,
				slug: schools.slug,
				name: schools.name,
				role: members.role,
				deletionRequestedAt: schools.deletionRequestedAt,
				status: schools.status,
			})
			.from(members)
			.innerJoin(schools, eq(schools.id, members.schoolId))
			.where(
				and(
					eq(members.userId, userId),
					eq(members.status, 'active'),
					or(
						eq(schools.status, 'active'),
						and(eq(schools.status, 'suspended'), eq(members.role, 'owner')),
						and(eq(schools.status, 'deleted'), eq(members.role, 'owner'), isNotNull(schools.deletionRequestedAt)),
					),
				),
			)
			.orderBy(schools.name),
	)
	return rows.map(({ deletionRequestedAt, status, ...s }) => ({
		...s,
		suspended: status === 'suspended',
		deleteAt: deletionRequestedAt ? deleteAtOf(deletionRequestedAt) : null,
	}))
}

export async function findSchoolBySlug(slug: string) {
	return (await db.select().from(schools).where(eq(schools.slug, slug)).limit(1))[0] ?? null
}

export { findActiveMember } from '#/kernel/members/members.ts'
