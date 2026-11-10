// Потоки курса и их кураторы (скилл lms-learners, карточка 4.2): список (куратор — только свои), создание, изменение,
// удаление с отвязкой учеников и ссылок; кураторы — активные сотрудники школы. Область куратора — `policies.ts`.
import type { GroupCreateInput, GroupCurator, GroupRow, GroupUpdateInput } from '@dinastia/contracts/learning'
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { courseOrFail } from '../courses/service.ts'
import { curatorGroupIds } from './policies.ts'
import { enrollmentInvites, enrollments, groupCurators, groups } from './schema.ts'

type Group = typeof groups.$inferSelect
const DAY_MS = 24 * 60 * 60 * 1000

/** Область потоков: куратор — только свои. */
const groupsScope = (ctx: SchoolCtx) =>
	ctx.member.role === 'curator' ? inArray(groups.id, curatorGroupIds(ctx)) : undefined

/** Поток этого курса (для зачисления и приглашений); чужой курс или нет потока — GROUP_NOT_FOUND. */
export async function groupOfCourse(ctx: BaseCtx, groupId: string, courseId: string): Promise<Group> {
	const [row] = await ctx.db
		.select()
		.from(groups)
		.where(and(eq(groups.id, groupId), eq(groups.courseId, courseId)))
	return row ?? fail.notFound('GROUP_NOT_FOUND')
}

/**
 * Конец доступа при зачислении в поток со своим сроком: от старта потока, если он впереди, иначе от момента зачисления.
 * У потока нет срока — `undefined` (действует срок курса).
 */
export function groupExpiry(group: Group | null, now: Date): Date | undefined {
	if (!group?.accessDays) return undefined
	const base = group.startsAt && group.startsAt > now ? group.startsAt : now
	return new Date(base.getTime() + group.accessDays * DAY_MS)
}

async function curatorsOf(ctx: SchoolCtx, groupIds: string[]) {
	if (!groupIds.length) return new Map<string, GroupCurator[]>()
	const rows = await ctx.db
		.select({ groupId: groupCurators.groupId, memberId: members.id, name: users.name, email: users.email })
		.from(groupCurators)
		.innerJoin(members, eq(members.id, groupCurators.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(inArray(groupCurators.groupId, groupIds))
		.orderBy(asc(users.name))
	const map = new Map<string, GroupCurator[]>()
	for (const { groupId, ...c } of rows) map.set(groupId, [...(map.get(groupId) ?? []), c])
	return map
}

async function rowsOf(ctx: SchoolCtx, where: ReturnType<typeof and>): Promise<GroupRow[]> {
	const students = ctx.db
		.select({ groupId: enrollments.groupId, n: count().as('n') })
		.from(enrollments)
		.groupBy(enrollments.groupId)
		.as('students')
	const rows = await ctx.db
		.select({ group: groups, students: sql<number>`coalesce(${students.n}, 0)::int` })
		.from(groups)
		.leftJoin(students, eq(students.groupId, groups.id))
		.where(where)
		.orderBy(sql`${groups.startsAt} asc nulls last`, asc(groups.createdAt))
	const curators = await curatorsOf(
		ctx,
		rows.map((r) => r.group.id),
	)
	return rows.map(({ group: g, students: n }) => ({
		id: g.id,
		courseId: g.courseId,
		title: g.title,
		startsAt: g.startsAt,
		endsAt: g.endsAt,
		accessDays: g.accessDays,
		students: n,
		curators: curators.get(g.id) ?? [],
	}))
}

export async function listGroups(ctx: SchoolCtx, courseId: string): Promise<GroupRow[]> {
	await courseOrFail(ctx, courseId)
	return rowsOf(ctx, and(eq(groups.courseId, courseId), groupsScope(ctx)))
}

async function groupRow(ctx: SchoolCtx, id: string): Promise<GroupRow> {
	const [row] = await rowsOf(ctx, eq(groups.id, id))
	return row ?? fail.notFound('GROUP_NOT_FOUND')
}

async function groupOrFail(ctx: SchoolCtx, id: string): Promise<Group> {
	const [row] = await ctx.db.select().from(groups).where(eq(groups.id, id)).for('update')
	return row ?? fail.notFound('GROUP_NOT_FOUND')
}

/** Активные сотрудники школы (не ученики) — кого можно назначить куратором. */
export async function curatorOptions(ctx: SchoolCtx): Promise<GroupCurator[]> {
	return ctx.db
		.select({ memberId: members.id, name: users.name, email: users.email })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(and(ne(members.role, 'student'), eq(members.status, 'active')))
		.orderBy(asc(users.name))
}

async function setCurators(ctx: SchoolCtx, groupId: string, memberIds: string[]) {
	const ids = [...new Set(memberIds)]
	if (ids.length) {
		const staff = await ctx.db
			.select({ id: members.id })
			.from(members)
			.where(and(inArray(members.id, ids), ne(members.role, 'student'), eq(members.status, 'active')))
		if (staff.length !== ids.length) fail.invalid('NOT_STAFF')
	}
	await ctx.db.delete(groupCurators).where(eq(groupCurators.groupId, groupId))
	if (ids.length) await ctx.db.insert(groupCurators).values(ids.map((memberId) => ({ groupId, memberId })))
	return ids
}

const fields = (input: Omit<GroupUpdateInput, 'id' | 'curatorIds'>) => ({
	title: input.title,
	startsAt: input.startsAt,
	endsAt: input.endsAt,
	accessDays: input.accessDays,
})

export async function createGroup(ctx: SchoolCtx, input: GroupCreateInput): Promise<GroupRow> {
	await courseOrFail(ctx, input.courseId)
	if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) fail.invalid('GROUP_DATES')
	const [row] = await ctx.db
		.insert(groups)
		.values({ courseId: input.courseId, ...fields(input) })
		.returning()
	const group = row as Group
	const curatorIds = await setCurators(ctx, group.id, input.curatorIds)
	await ctx.audit('learning.group.created', {
		entity: 'group',
		id: group.id,
		diff: { courseId: input.courseId, curatorIds },
	})
	return groupRow(ctx, group.id)
}

export async function updateGroup(ctx: SchoolCtx, input: GroupUpdateInput): Promise<GroupRow> {
	const prev = await groupOrFail(ctx, input.id)
	if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) fail.invalid('GROUP_DATES')
	await ctx.db.update(groups).set(fields(input)).where(eq(groups.id, prev.id))
	const before = (
		await ctx.db.select({ id: groupCurators.memberId }).from(groupCurators).where(eq(groupCurators.groupId, prev.id))
	)
		.map((r) => r.id)
		.sort()
	const after = (await setCurators(ctx, prev.id, input.curatorIds)).sort()
	await ctx.audit('learning.group.updated', { entity: 'group', id: prev.id })
	if (before.join() !== after.join())
		await ctx.audit('learning.group.curators-changed', {
			entity: 'group',
			id: prev.id,
			diff: { from: before, to: after },
		})
	return groupRow(ctx, prev.id)
}

/** Удалить поток: зачисления и приглашения остаются «без потока», кураторы снимаются (каскад). */
export async function removeGroup(ctx: SchoolCtx, id: string) {
	const group = await groupOrFail(ctx, id)
	await ctx.db.update(enrollments).set({ groupId: null }).where(eq(enrollments.groupId, group.id))
	await ctx.db.update(enrollmentInvites).set({ groupId: null }).where(eq(enrollmentInvites.groupId, group.id))
	await ctx.db.delete(groups).where(eq(groups.id, group.id))
	await ctx.audit('learning.group.deleted', { entity: 'group', id: group.id, diff: { courseId: group.courseId } })
	return { id: group.id }
}
