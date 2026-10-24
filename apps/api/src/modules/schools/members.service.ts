// Сотрудники школы (скилл lms-school): список, смена роли, блокировка. Правила — в сервисе, права — в процедуре.
import type { StaffListQuery } from '@dinastia/contracts/schools'
import { and, count, eq, ne, type SQL } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'

const columns = {
	id: members.id,
	userId: members.userId,
	name: users.name,
	email: users.email,
	role: members.role,
	status: members.status,
	joinedAt: members.joinedAt,
}

export async function listStaff(ctx: SchoolCtx, input: StaffListQuery) {
	const q = listQuery(input, {
		search: [users.name, users.email],
		sort: { name: users.name, role: members.role, joinedAt: members.joinedAt },
		tiebreak: members.id,
		filters: { role: members.role, status: members.status },
	})
	const where = and(ne(members.role, 'student'), q.where) as SQL
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
	return toPage(items, total?.n ?? 0, input)
}

async function getStaffOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db
		.select(columns)
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(members.id, id))
	if (!row || row.role === 'student') return fail.notFound('MEMBER_NOT_FOUND')
	return row
}

/** Общие правила изменения сотрудника: не себя, не владельца; администраторами управляет только владелец. */
function assertCanManage(ctx: SchoolCtx, target: { id: string; role: string }, newRole?: string) {
	if (target.id === ctx.member.id) fail.forbidden('CANNOT_CHANGE_SELF')
	if (target.role === 'owner') fail.forbidden('OWNER_IMMUTABLE')
	if ((target.role === 'admin' || newRole === 'admin') && ctx.member.role !== 'owner')
		fail.forbidden('ONLY_OWNER_MANAGES_ADMINS')
}

export async function changeStaffRole(ctx: SchoolCtx, input: { id: string; role: 'admin' | 'teacher' | 'curator' }) {
	const target = await getStaffOrFail(ctx, input.id)
	assertCanManage(ctx, target, input.role)
	await ctx.db.update(members).set({ role: input.role }).where(eq(members.id, input.id))
	ctx.log.info({ targetMemberId: input.id, from: target.role, to: input.role }, 'member role changed')
	return { ...target, role: input.role }
}

export async function setStaffStatus(ctx: SchoolCtx, input: { id: string; status: 'active' | 'blocked' }) {
	const target = await getStaffOrFail(ctx, input.id)
	assertCanManage(ctx, target)
	await ctx.db.update(members).set({ status: input.status }).where(eq(members.id, input.id))
	ctx.log.info({ targetMemberId: input.id, status: input.status }, 'member status changed')
	return { ...target, status: input.status }
}
