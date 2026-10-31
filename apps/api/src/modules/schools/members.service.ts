// Сотрудники школы (скилл lms-school): список, смена роли, блокировка. Правила — в сервисе, права — в процедуре.
import type { StaffListQuery, StaffMember } from '@dinastia/contracts/schools'
import { and, count, eq, ne, type SQL } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { signFileKey } from '#/kernel/storage/files.ts'
import { files } from '#/kernel/storage/schema.ts'
import { avatarPurpose } from './files.ts'

const columns = {
	id: members.id,
	userId: members.userId,
	name: users.name,
	email: users.email,
	role: members.role,
	status: members.status,
	joinedAt: members.joinedAt,
	avatarKey: files.key,
}

/** Строка сотрудника для API: ключ аватара → подписанная ссылка. */
async function toStaff({ avatarKey, ...row }: Omit<StaffMember, 'avatarUrl'> & { avatarKey: string | null }) {
	return { ...row, avatarUrl: avatarKey ? await signFileKey(avatarKey) : null } satisfies StaffMember
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
			.leftJoin(files, eq(files.id, members.avatarFileId))
			.where(where)
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		ctx.db.select({ n: count() }).from(members).innerJoin(users, eq(users.id, members.userId)).where(where),
	])
	return toPage(await Promise.all(items.map(toStaff)), total?.n ?? 0, input)
}

async function getStaffOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db
		.select(columns)
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.leftJoin(files, eq(files.id, members.avatarFileId))
		.where(eq(members.id, id))
	if (!row || row.role === 'student') return fail.notFound('MEMBER_NOT_FOUND')
	return toStaff(row)
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
	await ctx.audit('schools.member.role-changed', {
		entity: 'member',
		id: input.id,
		diff: { role: { from: target.role, to: input.role } },
	})
	ctx.log.info({ targetMemberId: input.id, from: target.role, to: input.role }, 'member role changed')
	return { ...target, role: input.role }
}

export async function setStaffStatus(ctx: SchoolCtx, input: { id: string; status: 'active' | 'blocked' }) {
	const target = await getStaffOrFail(ctx, input.id)
	assertCanManage(ctx, target)
	await ctx.db.update(members).set({ status: input.status }).where(eq(members.id, input.id))
	await ctx.audit('schools.member.status-changed', {
		entity: 'member',
		id: input.id,
		diff: { status: { from: target.status, to: input.status } },
	})
	ctx.log.info({ targetMemberId: input.id, status: input.status }, 'member status changed')
	return { ...target, status: input.status }
}

/** Ссылка на аватар участника (null — нет). */
export async function avatarUrlOf(ctx: BaseCtx, memberId: string) {
	const [row] = await ctx.db
		.select({ key: files.key })
		.from(members)
		.innerJoin(files, eq(files.id, members.avatarFileId))
		.where(eq(members.id, memberId))
	return row ? signFileKey(row.key) : null
}

/** Свой аватар: файл назначения schools.avatar, загруженный этим участником; прежний файл удаляется. */
export async function updateMyAvatar(ctx: SchoolCtx, fileId: string | null) {
	if (fileId) {
		const file = await ctx.files.get(fileId)
		if (file?.status !== 'ready' || file.purpose !== avatarPurpose.key || file.ownerMemberId !== ctx.member.id)
			fail.invalid('FILE_INVALID')
	}
	const [prev] = await ctx.db
		.select({ fileId: members.avatarFileId })
		.from(members)
		.where(eq(members.id, ctx.member.id))
	await ctx.db.update(members).set({ avatarFileId: fileId }).where(eq(members.id, ctx.member.id))
	if (prev?.fileId && prev.fileId !== fileId) await ctx.files.remove(prev.fileId)
}
