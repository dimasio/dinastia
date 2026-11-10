// Политики записей модуля learning (скилл permissions, карточка 4.2): куратор видит учеников, работы и попытки только своих
// потоков; остальные роли с правом — всю школу (изоляция школ — RLS). Единственное место правила для списка учеников,
// очереди проверки, карточки работы и ручной оценки тестов.
import { type AnyColumn, eq, inArray, type SQL } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { enrollments, groupCurators } from './schema.ts'

/** Потоки, где участник — куратор (подзапрос). */
export const curatorGroupIds = (ctx: SchoolCtx) =>
	ctx.db.select({ id: groupCurators.groupId }).from(groupCurators).where(eq(groupCurators.memberId, ctx.member.id))

/** Условие на `enrollments` (запрос с этой таблицей): у куратора — только зачисления его потоков, без потока — не видны. */
export function groupScope(ctx: SchoolCtx): SQL | undefined {
	if (ctx.member.role !== 'curator') return undefined
	return inArray(enrollments.groupId, curatorGroupIds(ctx))
}

/** То же по колонке `enrollment_id` другой таблицы (сдачи, попытки) — без соединения с `enrollments`. */
export function enrollmentScope(ctx: SchoolCtx, enrollmentId: AnyColumn): SQL | undefined {
	const scope = groupScope(ctx)
	if (!scope) return undefined
	return inArray(enrollmentId, ctx.db.select({ id: enrollments.id }).from(enrollments).where(scope))
}
