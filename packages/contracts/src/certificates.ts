// Контракт модуля certificates (скилл api-endpoints, lms-learners, карточка 4.7): шаблон сертификата курса и предпросмотр,
// выданные сертификаты курса (выдать прошедшим, аннулировать, скачать), сертификаты ученика, публичная проверка по номеру.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { CompactText, DateTime, Id, page, pageInput } from './common/index.ts'

export const CERTIFICATE_ORIENTATIONS = ['landscape', 'portrait'] as const
export const CERTIFICATE_STATUSES = ['pending', 'ready', 'failed'] as const
/** Подстановки в тексте шаблона. */
export const CERTIFICATE_PLACEHOLDERS = ['{имя}', '{курс}', '{дата}'] as const

/** Картинки шаблона: подпись и фон-бланк (назначения файлов — сервер, проверка до загрузки — клиент). */
export const CERTIFICATE_SIGNATURE = {
	purpose: 'certificates.signature',
	mime: ['image/png', 'image/jpeg'] as const,
	maxSize: 2 * 1024 * 1024,
}
export const CERTIFICATE_BACKGROUND = {
	purpose: 'certificates.background',
	mime: ['image/png', 'image/jpeg'] as const,
	maxSize: 10 * 1024 * 1024,
}

const Text120 = z.string().trim().max(120)

/** Поля шаблона (без курса). */
export const CertificateTemplateFields = z.object({
	enabled: z.boolean(),
	orientation: z.enum(CERTIFICATE_ORIENTATIONS),
	heading: Text120.min(1),
	body: CompactText,
	signerName: Text120.nullable(),
	signerTitle: Text120.nullable(),
	signatureFileId: Id.nullable(),
	backgroundFileId: Id.nullable(),
	showNumber: z.boolean(),
	showDate: z.boolean(),
})
export type CertificateTemplateFields = z.infer<typeof CertificateTemplateFields>

export const CertificateTemplate = CertificateTemplateFields.extend({
	courseId: Id,
	/** Ссылки на картинки (час) — для формы. */
	signatureUrl: z.string().nullable(),
	backgroundUrl: z.string().nullable(),
})
export type CertificateTemplate = z.infer<typeof CertificateTemplate>

export const CertificateRow = z.object({
	id: Id,
	enrollmentId: Id,
	number: z.string(),
	studentName: z.string(),
	issuedAt: DateTime,
	status: z.enum(CERTIFICATE_STATUSES),
	revokedAt: DateTime.nullable(),
})
export type CertificateRow = z.infer<typeof CertificateRow>

export const CertificateListInput = pageInput({
	sorts: ['issuedAt', 'number', 'studentName'] as const,
	defaultSort: 'issuedAt',
	defaultDir: 'desc',
}).extend({ courseId: Id })

/** Сертификат ученика (кабинет). */
export const MyCertificate = z.object({
	id: Id,
	courseId: Id,
	courseTitle: z.string(),
	number: z.string(),
	issuedAt: DateTime,
	/** Готов к скачиванию — `ready`; `pending` — «Сертификат готовится». */
	status: z.enum(CERTIFICATE_STATUSES),
})
export type MyCertificate = z.infer<typeof MyCertificate>

/** Номер: `<SLUG>-<год>-<порядковый>`; регистр не важен. Код — из ссылки QR. */
export const VerifyInput = z.object({
	number: z.string().trim().min(3).max(80),
	code: z
		.string()
		.trim()
		.regex(/^[A-Za-z0-9]{6,16}$/)
		.optional(),
})

export const CertificateCheck = z.object({
	number: z.string(),
	status: z.enum(['valid', 'revoked']),
	/** Полностью — только по ссылке с кодом; по номеру — «Иван П.». */
	studentName: z.string(),
	nameHidden: z.boolean(),
	courseTitle: z.string(),
	issuedAt: DateTime,
	schoolName: z.string(),
})
export type CertificateCheck = z.infer<typeof CertificateCheck>

const ById = z.object({ id: Id })
const ByCourse = z.object({ courseId: Id })
const Url = z.object({ url: z.string() })

export const certificatesContract = {
	template: {
		/** Шаблон курса; ещё не настроен — значения по умолчанию (выключен). */
		get: oc
			.route({ method: 'GET', path: '/courses/{courseId}/certificate-template' })
			.input(ByCourse)
			.output(CertificateTemplate),
		save: oc
			.route({ method: 'PUT', path: '/courses/{courseId}/certificate-template' })
			.input(CertificateTemplateFields.extend({ courseId: Id }))
			.output(CertificateTemplate),
		/** HTML сертификата-образца из полей формы (без сохранения) — та же вёрстка, что у PDF. */
		preview: oc
			.route({ method: 'POST', path: '/courses/{courseId}/certificate-template/preview' })
			.input(CertificateTemplateFields.extend({ courseId: Id }))
			.output(z.object({ html: z.string() })),
	},
	list: oc
		.route({ method: 'GET', path: '/courses/{courseId}/certificates' })
		.input(CertificateListInput)
		.output(page(CertificateRow)),
	/** Выдать прошедшим курс без сертификата и сформировать заново несформированные; шаблон выключен — `CERTIFICATE_DISABLED`. */
	issueCompleted: oc
		.route({ method: 'POST', path: '/courses/{courseId}/certificates/issue-completed' })
		.input(ByCourse)
		.output(z.object({ issued: z.number().int(), requeued: z.number().int() })),
	revoke: oc.route({ method: 'POST', path: '/certificates/{id}/revoke' }).input(ById).output(CertificateRow),
	/** Ссылка на PDF (10 минут); ещё не готов — `CERTIFICATE_NOT_READY`. */
	download: oc.route({ method: 'GET', path: '/certificates/{id}/download' }).input(ById).output(Url),
	my: {
		list: oc.route({ method: 'GET', path: '/learn/certificates' }).output(z.array(MyCertificate)),
		download: oc.route({ method: 'GET', path: '/learn/certificates/{id}/download' }).input(ById).output(Url),
	},
	/** Публично, без входа: проверка по номеру на сайте школы; не найден — `CERTIFICATE_NOT_FOUND`. */
	verify: oc.route({ method: 'GET', path: '/certificates/verify' }).input(VerifyInput).output(CertificateCheck),
}
