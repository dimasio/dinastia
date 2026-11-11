// Удаление школы (5.5, скилл personal-data §8): владелец запрашивает — школа сразу закрыта для всех (`status = deleted`),
// 30 дней владелец может отменить на корневом домене; затем задача ядра удаляет файлы школы в S3 и все её строки (каскад
// от `schools`), а пользователей без других членств — кроме владельца (его данные обрабатывает Dinastia как оператор).
import { schools } from '@dinastia/db'
import { and, eq, isNotNull, lt, ne } from 'drizzle-orm'
import { z } from 'zod'
import { auditFor } from '../audit/audit.ts'
import { PLATFORM } from '../auth/magic-link-email.tsx'
import { users } from '../auth/schema.ts'
import { appOrigin } from '../config.ts'
import type { SchoolCtx } from '../context.ts'
// biome-ignore lint/style/noRestrictedImports: удаление школы — вне тенанта: школа уже закрыта, строки уходят каскадом
import { db } from '../db/client.ts'
import { withTenant, withUser } from '../db/tenant.ts'
import { fail } from '../errors.ts'
import { defineJob } from '../jobs.ts'
import { deliverEmail } from '../mail/send.ts'
import { members } from '../members/schema.ts'
import { deletePrefix } from '../storage/s3.ts'
import { deletionEmail } from './emails.tsx'

export const DELETION_GRACE_DAYS = 30
export const DELETION_REMINDER_DAYS = 3
const DAY = 24 * 60 * 60 * 1000

export const deleteAtOf = (requestedAt: Date) => new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY)

/** Письмо владельцам (сразу и за 3 дня): школа закрыта — задача выполняется и для неактивной школы. */
export const deletionNoticeJob = defineJob({
	name: 'school-deletion.notice',
	schema: z.object({ kind: z.enum(['requested', 'soon']), requestedAt: z.iso.datetime() }),
	inactiveSchool: true,
	handler: async (ctx, d) => {
		const [school] = await ctx.db.select().from(schools).where(eq(schools.id, ctx.school.id)).limit(1)
		// отменили (или отменили и запросили заново) — это письмо уже не о том
		if (school?.status !== 'deleted' || school.deletionRequestedAt?.toISOString() !== d.requestedAt) return
		const owners = await ctx.db
			.select({ email: users.email })
			.from(members)
			.innerJoin(users, eq(users.id, members.userId))
			.where(and(eq(members.role, 'owner'), eq(members.status, 'active')))
		for (const o of owners)
			await deliverEmail(PLATFORM, deletionEmail, {
				to: o.email,
				data: {
					kind: d.kind,
					schoolName: school.name,
					deleteAt: deleteAtOf(school.deletionRequestedAt).toISOString(),
					url: `${appOrigin()}/`,
				},
			})
	},
})

/** Запрос владельца (подтверждение — адрес школы): школа закрывается сразу, письма — сейчас и за 3 дня. */
export async function requestSchoolDeletion(ctx: SchoolCtx, slug: string) {
	if (slug.trim().toLowerCase() !== ctx.school.slug) return fail.invalid('SLUG_MISMATCH')
	const now = ctx.now()
	const [row] = await ctx.db
		.update(schools)
		.set({ status: 'deleted', deletionRequestedAt: now })
		.where(and(eq(schools.id, ctx.school.id), eq(schools.status, 'active')))
		.returning()
	if (!row) return fail.conflict('SCHOOL_NOT_ACTIVE')
	await ctx.audit('schools.school.deletion-requested', { entity: 'school', id: row.id })
	const requestedAt = now.toISOString()
	await ctx.jobs.send(deletionNoticeJob, { kind: 'requested' as const, requestedAt })
	const remindAt = deleteAtOf(now).getTime() - DELETION_REMINDER_DAYS * DAY
	await ctx.jobs.send(deletionNoticeJob, { kind: 'soon' as const, requestedAt }, { startAfter: new Date(remindAt) })
	return { deleteAt: deleteAtOf(now) }
}

/** Отмена владельцем в течение 30 дней (корневой домен): школа снова активна. */
export async function cancelSchoolDeletion(userId: string, schoolId: string, actor: { ip: string | null }) {
	return withTenant(schoolId, async (tx) => {
		const [owner] = await tx
			.select({ id: members.id })
			.from(members)
			.where(and(eq(members.userId, userId), eq(members.role, 'owner'), eq(members.status, 'active')))
			.limit(1)
		if (!owner) return fail.notFound('SCHOOL_NOT_FOUND')
		const [row] = await tx
			.update(schools)
			.set({ status: 'active', deletionRequestedAt: null })
			.where(and(eq(schools.id, schoolId), eq(schools.status, 'deleted'), isNotNull(schools.deletionRequestedAt)))
			.returning()
		if (!row) return fail.conflict('SCHOOL_NOT_DELETING')
		await auditFor(tx, { memberId: owner.id, ip: actor.ip })('schools.school.deletion-cancelled', {
			entity: 'school',
			id: schoolId,
		})
		return row
	})
}

/**
 * Удалить школы, у которых прошло 30 дней: файлы по префиксу, затем строка `schools` (все таблицы школы — каскадом),
 * затем пользователи без других членств (кроме владельцев). Повторяемо: упавшая на школе задача продолжит со следующего
 * запуска — файлы удаляются раньше строк.
 */
export async function purgeDeletedSchools(now: Date, log: { info: (o: object, m: string) => void }) {
	const due = await db
		.select({ id: schools.id })
		.from(schools)
		.where(
			and(
				eq(schools.status, 'deleted'),
				lt(schools.deletionRequestedAt, new Date(now.getTime() - DELETION_GRACE_DAYS * DAY)),
			),
		)
	for (const { id } of due) {
		const files = await deletePrefix(`schools/${id}/`)
		const people = await withTenant(id, (tx) =>
			tx.select({ userId: members.userId }).from(members).where(ne(members.role, 'owner')),
		)
		await db.delete(schools).where(and(eq(schools.id, id), eq(schools.status, 'deleted')))
		let usersRemoved = 0
		for (const { userId } of people) {
			const elsewhere = await withUser(userId, (tx) =>
				tx.select({ id: members.id }).from(members).where(eq(members.userId, userId)).limit(1),
			)
			if (elsewhere.length) continue
			await db.delete(users).where(eq(users.id, userId))
			usersRemoved++
		}
		log.info({ schoolId: id, files, users: usersRemoved }, 'school purged')
	}
	return due.length
}

export const purgeSchoolsJob = defineJob({
	name: 'school-deletion.purge',
	scope: 'global',
	schema: z.object({}),
	schedule: '23 3 * * *',
	timeoutSeconds: 3600,
	handler: (ctx) => purgeDeletedSchools(ctx.now(), ctx.log),
})
