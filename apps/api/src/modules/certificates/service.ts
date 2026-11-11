// Сертификаты (скилл lms-learners, domain.md §3 «Сертификат», карточка 4.7): шаблон курса и предпросмотр; выдача при прохождении
// курса (номер из счётчика школы под блокировкой, снимок имени, курса и вида); PDF — задачей `certificates.render`; список курса,
// аннулирование, скачивание; сертификаты ученика; публичная проверка по номеру (имя скрыто, полностью — с кодом из QR).
import { randomBytes } from 'node:crypto'
import type {
	CertificateCheck,
	CertificateRow,
	CertificateTemplate,
	CertificateTemplateFields,
	MyCertificate,
} from '@dinastia/contracts/certificates'
import type { RichTextDoc, RichTextNode } from '@dinastia/contracts/common'
import { toHtml } from '@dinastia/contracts/rich-text/server'
import { createI18n } from '@dinastia/i18n'
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { renderSVG } from 'uqr'
import { z } from 'zod'
import { users } from '#/kernel/auth/schema.ts'
import { appOrigin } from '#/kernel/config.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { toPage } from '#/kernel/db/listing.ts'
import { documentHtml, PDF_MIME, renderPdf } from '#/kernel/documents/pdf.ts'
import { fail } from '#/kernel/errors.ts'
import { defineJob } from '#/kernel/jobs.ts'
import { members } from '#/kernel/members/schema.ts'
import { storeFile } from '#/kernel/storage/files.ts'
import { getObject } from '#/kernel/storage/s3.ts'
import { files } from '#/kernel/storage/schema.ts'
import { courseCards, courseOrFail } from '../courses/service.ts'
import { groupScope } from '../learning/policies.ts'
import { enrollments } from '../learning/schema.ts'
import { type CertificateData, certificateDocument } from './document.tsx'
import { certificateIssuedEmail } from './emails/issued.tsx'
import { certificateIssued } from './events.ts'
import { backgroundPurpose, CERTIFICATE_PDF_PURPOSE, signaturePurpose } from './files.ts'
import { certificateCounters, certificates, certificateTemplates } from './schema.ts'

const { t } = createI18n('ru')
const MSK = 'Europe/Moscow'
const NUMBER_DIGITS = 6
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** «11 ноября 2026 г.» по Москве. */
export const formatDate = (d: Date) =>
	new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: MSK }).format(d)
const yearOf = (d: Date) => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: MSK }).format(d))

export const certificateNumber = (slug: string, year: number, n: number) =>
	`${slug.toUpperCase()}-${year}-${String(n).padStart(NUMBER_DIGITS, '0')}`

/** Случайный код ссылки проверки: 8 знаков без похожих (0/O, 1/I). */
function verifyCode(): string {
	const bytes = randomBytes(8)
	return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** «Иван Петров Сергеевич» → «Иван П. С.»: первое слово полностью, остальные — первой буквой. */
export function maskName(name: string): string {
	const [first = '', ...rest] = name.trim().split(/\s+/)
	return [first, ...rest.map((w) => `${[...w][0] ?? ''}.`)].join(' ')
}

export const verifyUrl = (slug: string, number: string, code: string) =>
	`${appOrigin(slug)}/certificates/verify?${new URLSearchParams({ number, code })}`

// ── Шаблон ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const paragraph = (text: string, bold = false): RichTextNode => ({
	type: 'paragraph',
	content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }],
})

function defaults(): CertificateTemplateFields {
	return {
		enabled: false,
		orientation: 'landscape',
		heading: t('certificates:template.defaults.heading'),
		body: {
			type: 'doc',
			content: [
				paragraph(t('certificates:template.defaults.line1')),
				paragraph('{имя}', true),
				paragraph(t('certificates:template.defaults.line2')),
			],
		},
		signerName: null,
		signerTitle: null,
		signatureFileId: null,
		backgroundFileId: null,
		showNumber: true,
		showDate: true,
	}
}

type TemplateRow = typeof certificateTemplates.$inferSelect

const fieldsOf = (row: TemplateRow): CertificateTemplateFields => ({
	enabled: row.enabled,
	orientation: row.orientation,
	heading: row.heading,
	// в БД — документ, проверенный схемой профиля при записи (CompactText контракта)
	body: row.body as RichTextDoc,
	signerName: row.signerName,
	signerTitle: row.signerTitle,
	signatureFileId: row.signatureFileId,
	backgroundFileId: row.backgroundFileId,
	showNumber: row.showNumber,
	showDate: row.showDate,
})

async function templateRow(ctx: BaseCtx, courseId: string): Promise<TemplateRow | null> {
	const [row] = await ctx.db.select().from(certificateTemplates).where(eq(certificateTemplates.courseId, courseId))
	return row ?? null
}

const imageUrl = (ctx: BaseCtx, fileId: string | null) => (fileId ? ctx.files.signedUrl(fileId) : null)

async function withUrls(ctx: BaseCtx, courseId: string, f: CertificateTemplateFields): Promise<CertificateTemplate> {
	return {
		...f,
		courseId,
		signatureUrl: await imageUrl(ctx, f.signatureFileId),
		backgroundUrl: await imageUrl(ctx, f.backgroundFileId),
	}
}

export async function getTemplate(ctx: SchoolCtx, courseId: string): Promise<CertificateTemplate> {
	await courseOrFail(ctx, courseId)
	const row = await templateRow(ctx, courseId)
	return withUrls(ctx, courseId, row ? fieldsOf(row) : defaults())
}

/** Картинка шаблона: файл школы нужного назначения и загружен. */
async function checkImage(ctx: SchoolCtx, fileId: string | null, purpose: string) {
	if (!fileId) return
	const file = await ctx.files.get(fileId)
	if (file?.purpose !== purpose || file.status !== 'ready') fail.invalid('CERTIFICATE_IMAGE_INVALID')
}

export async function saveTemplate(
	ctx: SchoolCtx,
	input: CertificateTemplateFields & { courseId: string },
): Promise<CertificateTemplate> {
	await courseOrFail(ctx, input.courseId)
	await checkImage(ctx, input.signatureFileId, signaturePurpose.key)
	await checkImage(ctx, input.backgroundFileId, backgroundPurpose.key)
	const { courseId, ...fields } = input
	const before = await templateRow(ctx, courseId)
	await ctx.db
		.insert(certificateTemplates)
		.values({ courseId, ...fields })
		.onConflictDoUpdate({
			target: [certificateTemplates.schoolId, certificateTemplates.courseId],
			set: { ...fields, updatedAt: ctx.now() },
		})
	if ((before?.enabled ?? false) !== fields.enabled)
		await ctx.audit(fields.enabled ? 'certificates.template.enabled' : 'certificates.template.disabled', {
			entity: 'course',
			id: courseId,
		})
	return withUrls(ctx, courseId, fields)
}

// ── Вёрстка ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Подставить значения в текстовые узлы документа (до `toHtml`, который экранирует текст). */
function fill(doc: RichTextDoc, values: Record<string, string>): RichTextDoc {
	const walk = (n: RichTextNode): RichTextNode => ({
		...n,
		...(n.text !== undefined ? { text: n.text.replace(/\{(имя|курс|дата)\}/g, (m, k: string) => values[k] ?? m) } : {}),
		...(n.content ? { content: n.content.map(walk) } : {}),
	})
	return { ...doc, content: (doc.content ?? []).map(walk) }
}

interface LayoutInput {
	fields: CertificateTemplateFields
	schoolName: string
	studentName: string
	courseTitle: string
	number: string
	issuedAt: Date
	link: string
	signatureSrc: string | null
	backgroundSrc: string | null
}

function certificateData(l: LayoutInput): CertificateData {
	const date = formatDate(l.issuedAt)
	const body = fill(l.fields.body, { имя: l.studentName, курс: l.courseTitle, дата: date })
	return {
		orientation: l.fields.orientation,
		schoolName: l.schoolName,
		heading: l.fields.heading,
		bodyHtml: toHtml(body),
		signerName: l.fields.signerName,
		signerTitle: l.fields.signerTitle,
		signatureSrc: l.signatureSrc,
		backgroundSrc: l.backgroundSrc,
		number: l.fields.showNumber ? l.number : null,
		date: l.fields.showDate ? date : null,
		qrSvg: renderSVG(l.link, { ecc: 'M', border: 0 }),
		verifyUrl: l.link,
	}
}

/** HTML образца из полей формы (без сохранения): имя-пример, номер следующего вида, сегодняшняя дата. */
export async function previewTemplate(ctx: SchoolCtx, input: CertificateTemplateFields & { courseId: string }) {
	const course = await courseOrFail(ctx, input.courseId)
	const { courseId: _, ...fields } = input
	const now = ctx.now()
	const number = certificateNumber(ctx.school.slug, yearOf(now), 1)
	const data = certificateData({
		fields,
		schoolName: ctx.school.name,
		studentName: t('certificates:template.preview.studentName'),
		courseTitle: course.title,
		number,
		issuedAt: now,
		link: verifyUrl(ctx.school.slug, number, 'PREVIEW0'),
		signatureSrc: await imageUrl(ctx, fields.signatureFileId),
		backgroundSrc: await imageUrl(ctx, fields.backgroundFileId),
	})
	return { html: documentHtml(certificateDocument, data) }
}

// ── Выдача ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type CertificateRecord = typeof certificates.$inferSelect

/** Следующий номер школы за год: строка счётчика блокируется до конца транзакции — номера без дублей и пропусков. */
async function nextNumber(ctx: BaseCtx, year: number): Promise<number> {
	const [row] = await ctx.db
		.insert(certificateCounters)
		.values({ year, lastNumber: 1 })
		.onConflictDoUpdate({
			target: [certificateCounters.schoolId, certificateCounters.year],
			set: { lastNumber: sql`${certificateCounters.lastNumber} + 1` },
		})
		.returning({ n: certificateCounters.lastNumber })
	if (!row) throw new Error('certificate_counters: upsert без строки')
	return row.n
}

/**
 * Выдать сертификат по зачислению: курс пройден, шаблон включён, сертификата ещё нет (иначе — null). Повтор не создаёт
 * второй: уникальность зачисления; гонку двух выдач решает блокировка счётчика и уникальный индекс.
 */
export async function issueForEnrollment(ctx: BaseCtx, enrollmentId: string): Promise<CertificateRecord | null> {
	const [e] = await ctx.db
		.select({
			id: enrollments.id,
			courseId: enrollments.courseId,
			memberId: enrollments.memberId,
			status: enrollments.status,
			studentName: users.name,
		})
		.from(enrollments)
		.innerJoin(members, eq(members.id, enrollments.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(enrollments.id, enrollmentId))
	if (e?.status !== 'completed') return null
	const template = await templateRow(ctx, e.courseId)
	if (!template?.enabled) return null
	const [existing] = await ctx.db
		.select({ id: certificates.id })
		.from(certificates)
		.where(eq(certificates.enrollmentId, e.id))
	if (existing) return null
	const [course] = await courseCards(ctx, [e.courseId])
	if (!course) return null
	const issuedAt = ctx.now()
	const year = yearOf(issuedAt)
	const n = await nextNumber(ctx, year)
	const [row] = await ctx.db
		.insert(certificates)
		.values({
			enrollmentId: e.id,
			courseId: e.courseId,
			memberId: e.memberId,
			number: certificateNumber(ctx.school.slug, year, n),
			verifyCode: verifyCode(),
			studentName: e.studentName,
			courseTitle: course.title,
			issuedAt,
			layout: fieldsOf(template),
		})
		.onConflictDoNothing()
		.returning()
	if (!row) return null
	await ctx.jobs.send(renderCertificateJob, { certificateId: row.id })
	return row
}

/** Картинка из S3 как data URI (в браузере документа нет сети); нет файла — без картинки. */
async function dataUri(ctx: BaseCtx, fileId: string | null): Promise<string | null> {
	if (!fileId) return null
	const [file] = await ctx.db.select().from(files).where(eq(files.id, fileId))
	if (!file) return null
	const object = await getObject(file.key)
	return object ? `data:${file.mime};base64,${Buffer.from(object.body).toString('base64')}` : null
}

const safeName = (s: string) =>
	s
		.replace(/[\\/:*?"<>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 100)

/** Задача: напечатать PDF выданного сертификата (`pending` → `ready`); сбой — `failed` («Выдать прошедшим» повторит). */
export async function renderCertificate(ctx: BaseCtx, certificateId: string) {
	const [c] = await ctx.db.select().from(certificates).where(eq(certificates.id, certificateId))
	if (c?.status !== 'pending') return
	try {
		await ctx.db.transaction(async (sp) => {
			const inner = { ...ctx, db: sp }
			const fields = c.layout as CertificateTemplateFields
			const data = certificateData({
				fields,
				schoolName: ctx.school.name,
				studentName: c.studentName,
				courseTitle: c.courseTitle,
				number: c.number,
				issuedAt: c.issuedAt,
				link: verifyUrl(ctx.school.slug, c.number, c.verifyCode),
				signatureSrc: await dataUri(inner, fields.signatureFileId),
				backgroundSrc: await dataUri(inner, fields.backgroundFileId),
			})
			const pdf = await renderPdf(certificateDocument, data)
			const fileId = await storeFile(inner, {
				purpose: CERTIFICATE_PDF_PURPOSE,
				name: `${safeName(`${t('certificates:pdf.fileName')} ${c.number}`)}.pdf`,
				mime: PDF_MIME,
				body: pdf,
				ownerMemberId: c.memberId,
			})
			await sp.update(certificates).set({ status: 'ready', fileId }).where(eq(certificates.id, c.id))
			await inner.emit(certificateIssued, {
				certificateId: c.id,
				enrollmentId: c.enrollmentId,
				courseId: c.courseId,
				memberId: c.memberId,
			})
		})
	} catch (error) {
		ctx.log.error({ err: error, certificateId: c.id }, 'certificate render failed')
		await ctx.db.update(certificates).set({ status: 'failed' }).where(eq(certificates.id, c.id))
	}
}

export const renderCertificateJob = defineJob({
	name: 'certificates.render',
	schema: z.object({ certificateId: z.uuid() }),
	// повтор не поможет ошибке шаблона; сбой — `failed`, «Выдать прошедшим» формирует заново
	retry: { limit: 0 },
	timeoutSeconds: 120,
	handler: (ctx: BaseCtx, d) => renderCertificate(ctx, d.certificateId),
})

/** Письмо «сертификат готов» (4.8); аннулированный к этому моменту — без письма. */
export async function sendIssuedEmail(ctx: BaseCtx, certificateId: string) {
	const [row] = await ctx.db
		.select({ c: certificates, email: users.email })
		.from(certificates)
		.innerJoin(members, eq(members.id, certificates.memberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(certificates.id, certificateId))
	if (!row || row.c.revokedAt || row.c.status !== 'ready') return
	await ctx.mail.send(certificateIssuedEmail, {
		to: row.email,
		data: {
			courseTitle: row.c.courseTitle,
			number: row.c.number,
			url: `${appOrigin(ctx.school.slug)}/learn/courses/${row.c.courseId}`,
		},
	})
}

/** «Выдать прошедшим»: прошедшим курс без сертификата — выдать; несформированные (`failed`) — сформировать заново. */
export async function issueCompleted(ctx: SchoolCtx, courseId: string) {
	await courseOrFail(ctx, courseId)
	const template = await templateRow(ctx, courseId)
	if (!template?.enabled) return fail.conflict('CERTIFICATE_DISABLED')
	const missing = await ctx.db
		.select({ id: enrollments.id })
		.from(enrollments)
		.leftJoin(certificates, eq(certificates.enrollmentId, enrollments.id))
		.where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'completed'), isNull(certificates.id)))
	let issued = 0
	for (const m of missing) if (await issueForEnrollment(ctx, m.id)) issued++
	const failed = await ctx.db
		.update(certificates)
		.set({ status: 'pending' })
		.where(and(eq(certificates.courseId, courseId), eq(certificates.status, 'failed'), isNull(certificates.revokedAt)))
		.returning({ id: certificates.id })
	for (const f of failed) await ctx.jobs.send(renderCertificateJob, { certificateId: f.id })
	if (issued || failed.length)
		await ctx.audit('certificates.certificates.issued', {
			entity: 'course',
			id: courseId,
			diff: { issued, requeued: failed.length },
		})
	return { issued, requeued: failed.length }
}

// ── Списки и скачивание ────────────────────────────────────────────────────────────────────────────────────────────

const rowColumns = {
	id: certificates.id,
	enrollmentId: certificates.enrollmentId,
	number: certificates.number,
	studentName: certificates.studentName,
	issuedAt: certificates.issuedAt,
	status: certificates.status,
	revokedAt: certificates.revokedAt,
}

/** Сертификаты курса; куратор — только своих потоков. */
export async function listCertificates(
	ctx: SchoolCtx,
	input: {
		courseId: string
		page: number
		pageSize: number
		q?: string | undefined
		sort: 'issuedAt' | 'number' | 'studentName'
		dir: 'asc' | 'desc'
	},
) {
	const q = input.q?.replace(/[\\%_]/g, (m) => `\\${m}`)
	const where = and(
		eq(certificates.courseId, input.courseId),
		groupScope(ctx),
		q ? sql`(${certificates.studentName} ilike ${`%${q}%`} or ${certificates.number} ilike ${`%${q}%`})` : undefined,
	)
	const by = input.dir === 'desc' ? desc : asc
	const sortColumn = {
		issuedAt: certificates.issuedAt,
		number: certificates.number,
		studentName: certificates.studentName,
	}[input.sort]
	const items: CertificateRow[] = await ctx.db
		.select(rowColumns)
		.from(certificates)
		.innerJoin(enrollments, eq(enrollments.id, certificates.enrollmentId))
		.where(where)
		.orderBy(by(sortColumn), asc(certificates.id))
		.limit(input.pageSize)
		.offset((input.page - 1) * input.pageSize)
	const [total] = await ctx.db
		.select({ n: count() })
		.from(certificates)
		.innerJoin(enrollments, eq(enrollments.id, certificates.enrollmentId))
		.where(where)
	return toPage(items, total?.n ?? 0, input)
}

/** Сертификат курса в области сотрудника; чужой поток куратора — как не найден. */
async function staffCertificate(ctx: SchoolCtx, id: string): Promise<CertificateRecord> {
	const [row] = await ctx.db
		.select({ c: certificates })
		.from(certificates)
		.innerJoin(enrollments, eq(enrollments.id, certificates.enrollmentId))
		.where(and(eq(certificates.id, id), groupScope(ctx)))
	return row?.c ?? fail.notFound('CERTIFICATE_NOT_FOUND')
}

const toRow = (c: CertificateRecord): CertificateRow => ({
	id: c.id,
	enrollmentId: c.enrollmentId,
	number: c.number,
	studentName: c.studentName,
	issuedAt: c.issuedAt,
	status: c.status,
	revokedAt: c.revokedAt,
})

export async function revokeCertificate(ctx: SchoolCtx, id: string): Promise<CertificateRow> {
	const c = await staffCertificate(ctx, id)
	if (c.revokedAt) return toRow(c)
	const [row] = await ctx.db
		.update(certificates)
		.set({ revokedAt: ctx.now() })
		.where(eq(certificates.id, c.id))
		.returning()
	await ctx.audit('certificates.certificate.revoked', { entity: 'certificate', id: c.id, diff: { number: c.number } })
	return toRow(row ?? c)
}

async function downloadUrl(ctx: BaseCtx, c: CertificateRecord) {
	if (c.status !== 'ready' || !c.fileId) return fail.conflict('CERTIFICATE_NOT_READY')
	// файл с ПДн: ссылка короткая
	return { url: await ctx.files.signedUrl(c.fileId, { ttlSeconds: 10 * 60, download: true }) }
}

export async function downloadCertificate(ctx: SchoolCtx, id: string) {
	return downloadUrl(ctx, await staffCertificate(ctx, id))
}

/** Свои сертификаты ученика (без аннулированных). */
export async function listMyCertificates(ctx: SchoolCtx): Promise<MyCertificate[]> {
	return ctx.db
		.select({
			id: certificates.id,
			courseId: certificates.courseId,
			courseTitle: certificates.courseTitle,
			number: certificates.number,
			issuedAt: certificates.issuedAt,
			status: certificates.status,
		})
		.from(certificates)
		.where(and(eq(certificates.memberId, ctx.member.id), isNull(certificates.revokedAt)))
		.orderBy(desc(certificates.issuedAt))
}

export async function downloadMyCertificate(ctx: SchoolCtx, id: string) {
	const [c] = await ctx.db
		.select()
		.from(certificates)
		.where(and(eq(certificates.id, id), eq(certificates.memberId, ctx.member.id), isNull(certificates.revokedAt)))
	if (!c) return fail.notFound('CERTIFICATE_NOT_FOUND')
	return downloadUrl(ctx, c)
}

// ── Проверка ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Публичная проверка по номеру в школе хоста: имя скрыто, полностью — если код из ссылки QR совпал. */
export async function verifyCertificate(
	ctx: BaseCtx,
	input: { number: string; code?: string | undefined },
): Promise<CertificateCheck> {
	const [c] = await ctx.db
		.select()
		.from(certificates)
		.where(and(eq(certificates.number, input.number.trim().toUpperCase()), ne(certificates.status, 'failed')))
	if (!c) return fail.notFound('CERTIFICATE_NOT_FOUND')
	const full = input.code !== undefined && input.code.toUpperCase() === c.verifyCode
	return {
		number: c.number,
		status: c.revokedAt ? 'revoked' : 'valid',
		studentName: full ? c.studentName : maskName(c.studentName),
		nameHidden: !full,
		courseTitle: c.courseTitle,
		issuedAt: c.issuedAt,
		schoolName: ctx.school.name,
	}
}
