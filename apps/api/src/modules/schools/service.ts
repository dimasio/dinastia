// Школа и участники (скилл lms-school). Создание школы — до появления тенанта, поэтому вне SchoolCtx.

import { type SchoolCreate, SchoolCreate as SchoolCreateSchema } from '@dinastia/contracts/schools'
import { schools } from '@dinastia/db'
import { and, eq, sql } from 'drizzle-orm'
import { consents } from '#/kernel/auth/schema.ts'
import { db, type Tx } from '#/kernel/db/client.ts'
import { withUser } from '#/kernel/db/tenant.ts'
import { fail } from '#/kernel/errors.ts'
import { LEGAL_VERSIONS } from '#/kernel/legal.ts'
import { members } from './schema.ts'

/** Зарегистрировать школу: школа + владелец + согласия с офертой и политикой — одной транзакцией. */
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
		await tx.insert(consents).values([
			{ userId: owner.userId, schoolId: school.id, kind: 'offer', version: LEGAL_VERSIONS.offer, ip: owner.ip ?? null },
			{
				userId: owner.userId,
				schoolId: school.id,
				kind: 'privacy',
				version: LEGAL_VERSIONS.privacy,
				ip: owner.ip ?? null,
			},
		])
		return { school, member }
	})
}

/** Школы, где пользователь — активный участник (корневой домен: выбор школы). */
export async function listMySchools(userId: string) {
	return withUser(userId, (tx) =>
		tx
			.select({ id: schools.id, slug: schools.slug, name: schools.name, role: members.role })
			.from(members)
			.innerJoin(schools, eq(schools.id, members.schoolId))
			.where(and(eq(members.userId, userId), eq(members.status, 'active'), eq(schools.status, 'active')))
			.orderBy(schools.name),
	)
}

export async function findSchoolBySlug(slug: string) {
	return (await db.select().from(schools).where(eq(schools.slug, slug)).limit(1))[0] ?? null
}

/** Активное членство пользователя в школе транзакции (контекст запроса, пункт 0.5). */
export async function findActiveMember(tx: Tx, userId: string) {
	const [m] = await tx
		.select({ id: members.id, role: members.role })
		.from(members)
		.where(and(eq(members.userId, userId), eq(members.status, 'active')))
		.limit(1)
	return m ?? null
}
