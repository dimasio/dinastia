// Ученики школы (5.5): список всех учеников с числом курсов; удаление данных ученика по его запросу (обезличивание —
// ядро `anonymizeMember` + части модулей). Права — в процедурах.
import type { SchoolStudent, StudentListQuery } from '@dinastia/contracts/learning'
import { and, count, eq, type SQL, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { anonymizeMember } from '#/kernel/personal-data/personal-data.ts'
import { enrollments } from './schema.ts'

const coursesOf = sql<number>`(select count(*)::int from ${enrollments} where ${enrollments.memberId} = ${members.id})`

const columns = {
	id: members.id,
	name: users.name,
	email: users.email,
	status: members.status,
	courses: coursesOf,
	joinedAt: members.joinedAt,
}

const toStudent = (r: { email: string } & Omit<SchoolStudent, 'email'>): SchoolStudent => ({
	...r,
	email: r.status === 'deleted' ? null : r.email,
})

export async function listStudents(ctx: SchoolCtx, input: StudentListQuery) {
	const q = listQuery(input, {
		search: [users.name, users.email],
		sort: { name: users.name, joinedAt: members.joinedAt },
		tiebreak: members.id,
		filters: { status: members.status },
	})
	const where = and(eq(members.role, 'student'), q.where) as SQL
	const [items, [total]] = await Promise.all([
		ctx.db
			.select(columns)
			.from(members)
			.innerJoin(users, eq(users.id, members.userId))
			.where(where)
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		ctx.db.select({ n: count() }).from(members).innerJoin(users, eq(users.id, members.userId)).where(where),
	])
	return toPage(items.map(toStudent), total?.n ?? 0, input)
}

async function studentOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db
		.select({ ...columns, role: members.role })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(members.id, id))
	if (row?.role !== 'student') return fail.notFound('MEMBER_NOT_FOUND')
	const { role: _, ...student } = row
	return toStudent(student)
}

/** Удалить данные ученика (необратимо). В журнал — только id: имени после удаления нет. */
export async function anonymizeStudent(ctx: SchoolCtx, id: string) {
	const before = await studentOrFail(ctx, id)
	if (before.status === 'deleted') return fail.conflict('MEMBER_ALREADY_DELETED')
	const { userDeleted } = await anonymizeMember(ctx, id)
	await ctx.audit('learning.student.anonymized', { entity: 'member', id, diff: { userDeleted } })
	return studentOrFail(ctx, id)
}
