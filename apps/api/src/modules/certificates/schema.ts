// Таблицы модуля certificates (скилл db-schema, domain.md §1 «Сертификаты», карточка 4.7): шаблон курса, выданные сертификаты,
// счётчик номеров школы по годам.
import { opaqueJson, pii, richText, tenantRef, tenantTable } from '@dinastia/db'
import { boolean, index, integer, pgEnum, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { members } from '#/kernel/members/schema.ts'
import { courses } from '../courses/schema.ts'
import { enrollments } from '../learning/schema.ts'

export const CERTIFICATE_ORIENTATIONS = ['landscape', 'portrait'] as const
export const CERTIFICATE_STATUSES = ['pending', 'ready', 'failed'] as const
export const certificateOrientation = pgEnum('certificate_orientation', CERTIFICATE_ORIENTATIONS)
export const certificateStatus = pgEnum('certificate_status', CERTIFICATE_STATUSES)

/** Шаблон сертификата курса: один на курс; выключен — новые не выдаются, выданные остаются. */
export const certificateTemplates = tenantTable(
	'certificate_templates',
	{
		courseId: uuid('course_id').notNull(),
		enabled: boolean('enabled').notNull().default(false),
		orientation: certificateOrientation('orientation').notNull().default('landscape'),
		heading: text('heading').notNull(),
		/** Текст с подстановками `{имя}`, `{курс}`, `{дата}` (профиль `compact`). */
		body: richText('body').notNull(),
		/** ФИО подписанта — сотрудник школы. */
		signerName: pii(text('signer_name')),
		signerTitle: text('signer_title'),
		/** Картинка подписи (`certificates.signature`). */
		signatureFileId: uuid('signature_file_id'),
		/** Фон — бланк школы на весь лист (`certificates.background`). */
		backgroundFileId: uuid('background_file_id'),
		showNumber: boolean('show_number').notNull().default(true),
		showDate: boolean('show_date').notNull().default(true),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), uniqueIndex().on(t.schoolId, t.courseId)],
)

/**
 * Выданный сертификат: один на зачисление. Имя, курс и вид шаблона — снимок на момент выдачи (правки шаблона выданное не
 * меняют). `verify_code` — в ссылке QR: по номеру проверка показывает имя скрыто, с кодом — полностью.
 */
export const certificates = tenantTable(
	'certificates',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		courseId: uuid('course_id').notNull(),
		memberId: uuid('member_id').notNull(),
		/** `<SLUG>-<год>-<000001>`; уникален в школе. */
		number: text('number').notNull(),
		verifyCode: text('verify_code').notNull(),
		studentName: pii(text('student_name').notNull()),
		courseTitle: text('course_title').notNull(),
		issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
		/** Вид шаблона на момент выдачи (поля `certificate_templates`) — читает только задача PDF (D-032). */
		layout: opaqueJson('layout').notNull(),
		status: certificateStatus('status').notNull().default('pending'),
		/** PDF (`certificates.pdf`, private). */
		fileId: uuid('file_id'),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.courseId, courses, 'cascade'),
		tenantRef(t, t.memberId, members, 'cascade'),
		uniqueIndex().on(t.schoolId, t.enrollmentId),
		uniqueIndex().on(t.schoolId, t.number),
		index().on(t.schoolId, t.courseId),
		index().on(t.schoolId, t.memberId),
	],
)

/** Последний номер сертификата школы за год (выдача берёт следующий под блокировкой строки — без дублей и пропусков). */
export const certificateCounters = tenantTable(
	'certificate_counters',
	{
		year: integer('year').notNull(),
		lastNumber: integer('last_number').notNull().default(0),
	},
	(t) => [uniqueIndex().on(t.schoolId, t.year)],
)
