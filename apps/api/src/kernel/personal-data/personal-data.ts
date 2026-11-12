// Данные человека (5.5, скилл personal-data): архив данных участника и обезличивание ученика. Части модулей —
// `definePersonalData` в `defineModule`; здесь — профиль, согласия, файлы и выгрузки участника (таблицы ядра) и замена
// пользователя заглушкой.
import type { RichTextDoc } from '@dinastia/db'
import { and, eq, ne, sql } from 'drizzle-orm'
import { consents, users } from '../auth/schema.ts'
import type { BaseCtx } from '../context.ts'
import { withUser } from '../db/tenant.ts'
import { fail } from '../errors.ts'
import type { ArchiveEntry } from '../exports/define.ts'
import { exports } from '../exports/schema.ts'
import { members } from '../members/schema.ts'
import { allPersonalData } from '../registry.ts'
import { files } from '../storage/schema.ts'

/** Имя заглушки обезличенного ученика — видно во всех списках школы вместо имени. */
export const DELETED_NAME = 'Удалённый слушатель'
/** Текст вместо удалённого текста ученика (ответы, работы, комментарии) — для частей модулей. */
export const DELETED_TEXT = 'Удалено'
export const deletedDoc = (): RichTextDoc => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: DELETED_TEXT }] }],
})

/** Участник школы как субъект ПДн: обезличенный — `MEMBER_NOT_FOUND`. */
export async function dataSubject(ctx: Pick<BaseCtx, 'db'>, memberId: string) {
	const [row] = await ctx.db
		.select({
			memberId: members.id,
			userId: members.userId,
			email: users.email,
			role: members.role,
			status: members.status,
		})
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(members.id, memberId))
		.limit(1)
	if (!row || row.status === 'deleted') return fail.notFound('MEMBER_NOT_FOUND')
	return { ...row, email: row.email.toLowerCase() }
}

/** Записи архива «мои данные»: `data.json` (профиль ядра + разделы модулей) и файлы участника этой школы. */
export async function personalDataEntries(ctx: BaseCtx, memberId: string): Promise<ArchiveEntry[]> {
	const subject = await dataSubject(ctx, memberId)
	const [profile] = await ctx.db
		.select({
			name: users.name,
			email: users.email,
			role: members.role,
			status: members.status,
			joinedAt: members.joinedAt,
			avatarFileId: members.avatarFileId,
		})
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(members.id, memberId))
	const given = await ctx.db
		.select({ kind: consents.kind, version: consents.version, ip: consents.ip, createdAt: consents.createdAt })
		.from(consents)
		.where(and(eq(consents.userId, subject.userId), eq(consents.schoolId, ctx.school.id)))
		.orderBy(consents.createdAt)

	const entries: ArchiveEntry[] = []
	const sections: Record<string, unknown> = {}
	for (const { module, part } of allPersonalData()) {
		const { data, files: own } = await part.export(ctx, subject)
		sections[module] = data
		entries.push(...own)
	}
	if (profile?.avatarFileId) entries.push({ path: 'files/avatar', fileId: profile.avatarFileId })
	const { avatarFileId: _, ...person } = profile ?? {}
	const data = {
		school: { name: ctx.school.name, slug: ctx.school.slug },
		exportedAt: ctx.now(),
		profile: person,
		consents: given,
		...sections,
	}
	return [{ path: 'data.json', body: JSON.stringify(data, null, 2) }, ...entries]
}

/**
 * Обезличить ученика в школе (необратимо): части модулей удаляют файлы и тексты, оценки и прогресс остаются; затем —
 * выгрузки и оставшиеся файлы участника, согласия этой школы, IP в журнале; участник переводится на пользователя-заглушку
 * со статусом `deleted`. Пользователь без других членств удаляется (сессии и входы — каскадом).
 */
export async function anonymizeMember(ctx: BaseCtx, memberId: string) {
	const subject = await dataSubject(ctx, memberId)
	if (subject.role !== 'student') return fail.conflict('NOT_A_STUDENT')

	for (const { part } of allPersonalData()) await part.anonymize(ctx, subject)

	const own = await ctx.db
		.delete(exports)
		.where(eq(exports.requestedByMemberId, memberId))
		.returning({ fileId: exports.fileId })
	const [{ avatarFileId } = { avatarFileId: null }] = await ctx.db
		.select({ avatarFileId: members.avatarFileId })
		.from(members)
		.where(eq(members.id, memberId))
	const [stub] = await ctx.db
		.insert(users)
		.values({ name: DELETED_NAME, email: `deleted+${memberId}@deleted.invalid`, deletedAt: ctx.now() })
		.returning({ id: users.id })
	if (!stub) throw new Error('заглушка не создана')
	await ctx.db
		.update(members)
		.set({ userId: stub.id, status: 'deleted', avatarFileId: null })
		.where(eq(members.id, memberId))
	const left = await ctx.db.select({ id: files.id }).from(files).where(eq(files.ownerMemberId, memberId))
	for (const id of new Set([...own.map((o) => o.fileId), avatarFileId, ...left.map((f) => f.id)]))
		if (id) await ctx.files.remove(id)

	await ctx.db.delete(consents).where(and(eq(consents.userId, subject.userId), eq(consents.schoolId, ctx.school.id)))
	await ctx.db.execute(sql`select audit_forget_ip(${memberId}::uuid)`)

	// другие школы не видны транзакции школы — членства пользователя вне неё (RLS по app.user_id)
	const elsewhere = await withUser(subject.userId, (tx) =>
		tx
			.select({ id: members.id })
			.from(members)
			.where(and(eq(members.userId, subject.userId), ne(members.schoolId, ctx.school.id)))
			.limit(1),
	)
	if (!elsewhere.length) await ctx.db.delete(users).where(eq(users.id, subject.userId))
	return { memberId, userDeleted: !elsewhere.length }
}
