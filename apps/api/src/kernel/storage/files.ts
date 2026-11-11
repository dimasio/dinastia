// Файлы школы (скилл files-media): назначения, загрузка по presigned URL с подтверждением, подписанные ссылки на
// чтение, удаление. Сущность хранит file_id; право читать файл проверяет сервис сущности — здесь только школа (RLS).
import { and, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Permission } from '../../permissions.ts'
import type { BaseCtx, SchoolCtx } from '../context.ts'
import type { Tx } from '../db/client.ts'
import { fail } from '../errors.ts'
import { defineJob, type Jobs } from '../jobs.ts'
import { filePurpose } from '../registry.ts'
import { deleteObject, headObject, presignGet, presignPut } from './s3.ts'
import { files } from './schema.ts'

export const MB = 1024 * 1024

export interface FilePurpose {
	/** `<модуль>.<назначение>` (kebab-case): `schools.avatar`, `courses.cover`. */
	key: string
	/** Байты, ≤ 2 ГБ. */
	maxSize: number
	/** Допустимые MIME-типы. */
	mime: readonly string[]
	/** Кто может загружать; без него — любой участник школы. */
	perm?: Permission
}

export const PURPOSE_KEY = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/

export function defineFilePurpose(def: FilePurpose): FilePurpose {
	if (!PURPOSE_KEY.test(def.key)) throw new Error(`назначение «${def.key}»: ключ — <модуль>.<назначение> в kebab-case`)
	if (def.maxSize > 2048 * MB) throw new Error(`назначение «${def.key}»: больше 2 ГБ — загрузка частями, спросить`)
	return def
}

export const objectKey = (schoolId: string, purpose: string, fileId: string) =>
	`schools/${schoolId}/${purpose}/${fileId}`

/** Начать загрузку: строка pending + ссылка на PUT (15 минут). Лимиты назначения проверяются до выдачи ссылки. */
export async function createUpload(
	ctx: SchoolCtx,
	input: { purpose: string; name: string; mime: string; size: number },
) {
	const purpose = filePurpose(input.purpose)
	if (!purpose) return fail.invalid('FILE_PURPOSE_UNKNOWN')
	if (purpose.perm && !ctx.can(purpose.perm)) fail.forbidden('NO_PERMISSION', { permission: purpose.perm })
	if (!purpose.mime.includes(input.mime)) fail.invalid('FILE_TYPE_NOT_ALLOWED', { allowed: purpose.mime })
	if (input.size > purpose.maxSize) fail.invalid('FILE_TOO_LARGE', { maxSize: purpose.maxSize })

	const [row] = await ctx.db.execute<{ id: string }>(sql`select uuidv7() as id`).then((r) => r.rows)
	if (!row) throw new Error('uuidv7 не вернул id')
	const key = objectKey(ctx.school.id, purpose.key, row.id)
	await ctx.db.insert(files).values({
		id: row.id,
		key,
		purpose: purpose.key,
		name: input.name,
		mime: input.mime,
		size: input.size,
		ownerMemberId: ctx.member.id,
	})
	const uploadUrl = await presignPut(key, input.mime, input.size)
	// content-length браузер ставит сам по телу запроса — подписанное значение совпадёт, если файл тот же
	return { fileId: row.id, uploadUrl, headers: { 'content-type': input.mime } }
}

/** Подтвердить загрузку: объект есть, размер и тип совпали — ready; иначе объект удаляется. Подтверждает загрузивший. */
export async function completeUpload(ctx: SchoolCtx, fileId: string) {
	const [file] = await ctx.db.select().from(files).where(eq(files.id, fileId)).limit(1)
	if (!file || file.ownerMemberId !== ctx.member.id) return fail.notFound('FILE_NOT_FOUND')
	const info = { id: file.id, name: file.name, mime: file.mime, size: file.size }
	if (file.status === 'ready') return info
	const head = await headObject(file.key)
	if (!head) return fail.conflict('FILE_NOT_UPLOADED')
	if (head.size !== file.size || head.mime !== file.mime) {
		await deleteObject(file.key)
		await ctx.db.delete(files).where(eq(files.id, file.id))
		return fail.invalid('FILE_UPLOAD_MISMATCH')
	}
	await ctx.db.update(files).set({ status: 'ready' }).where(eq(files.id, file.id))
	return info
}

/** Ссылка на чтение по ключу объекта (для выборок с join, без лишнего запроса). */
export function signFileKey(key: string, opts: { ttlSeconds?: number; downloadName?: string } = {}) {
	return presignGet(key, { ttlSeconds: opts.ttlSeconds ?? 60 * 60, downloadName: opts.downloadName })
}

export const deleteObjectJob = defineJob({
	name: 'files.delete-object',
	schema: z.object({ key: z.string().startsWith('schools/') }),
	handler: (_ctx, d) => deleteObject(d.key),
})

export interface Files {
	/** Подписанная ссылка на готовый файл школы (по умолчанию час); права на сущность проверяет вызывающий сервис. */
	signedUrl(fileId: string, opts?: { ttlSeconds?: number; download?: boolean }): Promise<string>
	/** Файл школы (или null); `purpose` — проверить, что файл того назначения. */
	get(fileId: string): Promise<typeof files.$inferSelect | null>
	/** Удалить строку сейчас, объект — задачей после коммита (откат — объект на месте). */
	remove(fileId: string): Promise<void>
}

export function filesFor(tx: Tx, jobs: Jobs): Files {
	const get = async (fileId: string) => (await tx.select().from(files).where(eq(files.id, fileId)).limit(1))[0] ?? null
	return {
		get,
		async signedUrl(fileId, opts = {}) {
			const file = await get(fileId)
			if (file?.status !== 'ready') return fail.notFound('FILE_NOT_FOUND')
			return signFileKey(file.key, {
				...(opts.ttlSeconds ? { ttlSeconds: opts.ttlSeconds } : {}),
				...(opts.download ? { downloadName: file.name } : {}),
			})
		},
		async remove(fileId) {
			const [file] = await tx.delete(files).where(eq(files.id, fileId)).returning({ key: files.key })
			if (file) await jobs.send(deleteObjectJob, { key: file.key })
		},
	}
}

/** Незавершённые загрузки старше суток — удалить (раз в час по всем школам). */
export const cleanupPendingJob = defineJob({
	name: 'files.cleanup-pending',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '17 * * * *',
	handler: async (ctx: BaseCtx) => {
		const before = new Date(ctx.now().getTime() - 24 * 60 * 60 * 1000)
		const stale = await ctx.db
			.delete(files)
			.where(and(eq(files.status, 'pending'), lt(files.createdAt, before)))
			.returning({ key: files.key })
		for (const f of stale) await deleteObject(f.key)
		if (stale.length) ctx.log.info({ count: stale.length }, 'stale uploads removed')
	},
})
