// Выгрузки таблиц в xlsx (скилл documents, D-013): запрос проверяет право и готовит параметры (`prepare`), ставит задачу
// `exports.run`; задача собирает строки пачками, пишет xlsx в S3 и строку `files` (назначение `exports.file` — не для загрузки
// пользователем), ссылку получает только запросивший, через сутки файл удаляет `exports.cleanup`.
import type { ExportState } from '@dinastia/contracts/exports'
import { createI18n } from '@dinastia/i18n'
import { and, eq, lt } from 'drizzle-orm'
import { zipSync } from 'fflate'
import writeXlsxFile, { type Cell, type SheetData } from 'write-excel-file/node'
import { z } from 'zod'
import type { BaseCtx, SchoolCtx } from '../context.ts'
import { fail } from '../errors.ts'
import { defineJob } from '../jobs.ts'
import { exportByKey } from '../registry.ts'
import { signFileKey, storeFile } from '../storage/files.ts'
import { getObject } from '../storage/s3.ts'
import { files } from '../storage/schema.ts'
import {
	ARCHIVE_MAX_BYTES,
	type ArchiveExportDef,
	EXPORT_MAX_ROWS,
	type ExportCell,
	type ExportColumn,
	type ExportDef,
} from './define.ts'
import { exports } from './schema.ts'

export const EXPORT_FILE_PURPOSE = 'exports.file'
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ZIP_MIME = 'application/zip'
/** Москва без перехода на летнее время: дата в файле — как на часах школы. */
const MSK_MS = 3 * 60 * 60 * 1000

type Row = typeof exports.$inferSelect

/** Состояние без ссылки; ссылку добавляет `getExport` для готовой. */
const stateOf = (row: Row): ExportState => ({
	id: row.id,
	key: row.key,
	status: row.status,
	rows: row.rows,
	url: null,
	createdAt: row.createdAt,
	expiresAt: row.expiresAt,
})

/** Поставить выгрузку: право определения, вход по схеме, `prepare` (доступ и область), задача, журнал. */
export async function startExport(ctx: SchoolCtx, input: { key: string; input: unknown }): Promise<ExportState> {
	const def = exportByKey(input.key)
	if (!def) return fail.invalid('EXPORT_UNKNOWN')
	if (!ctx.can(def.perm)) return fail.forbidden('NO_PERMISSION', { permission: def.perm })
	const parsed = def.input.safeParse(input.input)
	if (!parsed.success) return fail.invalid('EXPORT_INPUT_INVALID')
	const params = await def.prepare(ctx, parsed.data)
	const [row] = await ctx.db
		.insert(exports)
		.values({
			key: def.key,
			params,
			requestedByMemberId: ctx.member.id,
			expiresAt: new Date(ctx.now().getTime() + EXPORT_TTL_MS),
		})
		.returning()
	if (!row) throw new Error('exports: insert без строки')
	await ctx.jobs.send(runExportJob, { exportId: row.id })
	await ctx.audit('exports.export.created', { entity: 'export', id: row.id, diff: { key: def.key } })
	return stateOf(row)
}

/** Состояние выгрузки; чужая (другой сотрудник, другая школа) и удалённая не различаются — EXPORT_NOT_FOUND. */
export async function getExport(ctx: SchoolCtx, id: string): Promise<ExportState> {
	const [row] = await ctx.db
		.select()
		.from(exports)
		.where(and(eq(exports.id, id), eq(exports.requestedByMemberId, ctx.member.id)))
		.limit(1)
	if (!row || row.expiresAt <= ctx.now()) return fail.notFound('EXPORT_NOT_FOUND')
	const state = stateOf(row)
	if (row.status === 'ready' && row.fileId) {
		const [file] = await ctx.db.select().from(files).where(eq(files.id, row.fileId)).limit(1)
		// ссылка короткая: файл с ПДн
		if (file) state.url = await signFileKey(file.key, { ttlSeconds: 10 * 60, downloadName: file.name })
	}
	return state
}

const cellOf = (value: ExportCell, type: ExportColumn<unknown>['type']): Cell => {
	if (value === null || value === undefined) return null
	switch (type) {
		case 'number':
			return { value: Number(value), type: Number }
		case 'percent':
			return { value: Number(value) / 100, type: Number, format: '0%' }
		case 'date':
		case 'datetime':
			return {
				value: new Date(new Date(value).getTime() + MSK_MS),
				type: Date,
				format: type === 'date' ? 'dd.mm.yyyy' : 'dd.mm.yyyy hh:mm',
			}
		default:
			return { value: String(value), type: String }
	}
}

/** Собрать xlsx: заголовки (i18n), строки пачками, не больше `EXPORT_MAX_ROWS`. */
// biome-ignore lint/suspicious/noExplicitAny: строки выгрузки — свои у каждого определения
export async function buildXlsx(ctx: BaseCtx, def: ExportDef<any, any, any>, params: unknown) {
	const { t } = createI18n('ru')
	const columns = def.columns as ExportColumn<Record<string, ExportCell>>[]
	const data: SheetData = [
		columns.map((c) => ({ value: t(c.title as never) as string, type: String, fontWeight: 'bold' })),
	]
	let count = 0
	for await (const batch of def.rows(ctx, params) as AsyncIterable<Record<string, ExportCell>[]>) {
		for (const r of batch) {
			if (count >= EXPORT_MAX_ROWS) return fail.invalid('EXPORT_TOO_LARGE', { max: EXPORT_MAX_ROWS })
			data.push(
				columns.map((c) => {
					const v = r[c.key] ?? null
					return cellOf(c.labels && v !== null ? (t(`${c.labels}.${v}` as never) as string) : v, c.type)
				}),
			)
			count++
		}
	}
	const buffer = await writeXlsxFile(data, {
		columns: columns.map((c) => ({ width: c.width ?? 20 })),
		stickyRowsCount: 1,
	}).toBuffer()
	return { buffer: new Uint8Array(buffer), rows: count }
}

/**
 * Собрать zip: записи определения, файлы школы — из S3 (только этой школы: строка `files` под RLS); суммарно не больше
 * `ARCHIVE_MAX_BYTES`. Пути — внутри архива, без `..` и абсолютных.
 */
// biome-ignore lint/suspicious/noExplicitAny: параметры — свои у каждого определения
export async function buildZip(ctx: BaseCtx, def: ArchiveExportDef<any, any>, params: unknown) {
	const out: Record<string, Uint8Array> = {}
	let total = 0
	const encoder = new TextEncoder()
	for (const entry of await def.entries(ctx, params)) {
		const path = entry.path.replace(/\\/g, '/')
		if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`zip: недопустимый путь «${path}»`)
		let body: Uint8Array | null
		if ('fileId' in entry) {
			const [file] = await ctx.db.select().from(files).where(eq(files.id, entry.fileId)).limit(1)
			body = file?.status === 'ready' ? ((await getObject(file.key))?.body ?? null) : null
			if (!body) continue
		} else body = typeof entry.body === 'string' ? encoder.encode(entry.body) : entry.body
		total += body.length
		if (total > ARCHIVE_MAX_BYTES) return fail.invalid('EXPORT_TOO_LARGE', { maxBytes: ARCHIVE_MAX_BYTES })
		out[path in out ? `${path}.${Object.keys(out).length}` : path] = body
	}
	return { buffer: zipSync(out, { level: 6 }), rows: Object.keys(out).length }
}

/** Имя файла: без символов, недопустимых в именах файлов, не длиннее 100 символов. */
const safeName = (name: string) =>
	name
		.replace(/[\\/:*?"<>|]+/g, ' ')
		// \s покрывает переводы строк и табуляцию; прочие управляющие символы в названиях курсов не встречаются
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 100) || 'export'

export const runExportJob = defineJob({
	name: 'exports.run',
	schema: z.object({ exportId: z.uuid() }),
	// повтор не поможет ошибке данных; сбой — `failed`, пользователь запускает заново
	retry: { limit: 0 },
	timeoutSeconds: 600,
	handler: async (ctx: BaseCtx, d) => {
		const [row] = await ctx.db.select().from(exports).where(eq(exports.id, d.exportId)).limit(1)
		if (row?.status !== 'pending') return
		const def = exportByKey(row.key)
		try {
			if (!def) throw new Error(`выгрузка «${row.key}» не объявлена`)
			// точка сохранения: ошибка запроса не обрывает транзакцию задачи — статус `failed` записывается
			await ctx.db.transaction(async (sp) => {
				const inner = { ...ctx, db: sp }
				const zip = def.format === 'zip'
				const { buffer, rows } = zip ? await buildZip(inner, def, row.params) : await buildXlsx(inner, def, row.params)
				const name = `${safeName(await def.fileName(inner, row.params))}.${zip ? 'zip' : 'xlsx'}`
				const fileId = await storeFile(inner, {
					purpose: EXPORT_FILE_PURPOSE,
					name,
					mime: zip ? ZIP_MIME : XLSX_MIME,
					body: buffer,
					ownerMemberId: row.requestedByMemberId,
				})
				await sp
					.update(exports)
					.set({ status: 'ready', fileId, rows, finishedAt: ctx.now() })
					.where(eq(exports.id, row.id))
			})
		} catch (error) {
			ctx.log.error({ err: error, exportId: row.id, key: row.key }, 'export failed')
			await ctx.db.update(exports).set({ status: 'failed', finishedAt: ctx.now() }).where(eq(exports.id, row.id))
		}
	},
})

/** Истёкшие выгрузки — удалить строку и файл (раз в час по всем школам). */
export const cleanupExportsJob = defineJob({
	name: 'exports.cleanup',
	schema: z.object({}),
	scope: 'all-schools',
	schedule: '41 * * * *',
	handler: async (ctx: BaseCtx) => {
		const stale = await ctx.db
			.delete(exports)
			.where(lt(exports.expiresAt, ctx.now()))
			.returning({ fileId: exports.fileId })
		for (const s of stale) if (s.fileId) await ctx.files.remove(s.fileId)
		if (stale.length) ctx.log.info({ count: stale.length }, 'expired exports removed')
	},
})
