// Таблицы модуля learning (скилл db-schema, domain.md §1 «Обучение»): потоки и их кураторы (4.2), зачисление, приглашения,
// факты прохождения уроков; дедлайны, `lesson_progress.status` — дальше в фазе 4 (доступность считается при чтении).
import { pii, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, integer, pgEnum, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { members } from '#/kernel/members/schema.ts'
import { courses, lessons } from '../courses/schema.ts'

export const ENROLLMENT_STATUSES = ['active', 'completed', 'expired', 'revoked'] as const
export const ENROLLMENT_SOURCES = ['manual', 'invite', 'link'] as const
export const enrollmentStatus = pgEnum('enrollment_status', ENROLLMENT_STATUSES)
export const enrollmentSource = pgEnum('enrollment_source', ENROLLMENT_SOURCES)

/**
 * Поток курса (4.2): набор учеников с общим стартом и кураторами. Старт, окончание и срок доступа необязательны; окончание —
 * для информации, доступ не ограничивает. Удаление — сервис сначала отвязывает зачисления и приглашения (ключи `no action`).
 */
export const groups = tenantTable(
	'groups',
	{
		courseId: uuid('course_id').notNull(),
		title: text('title').notNull(),
		startsAt: timestamp('starts_at', { withTimezone: true }),
		endsAt: timestamp('ends_at', { withTimezone: true }),
		/** Срок доступа зачисленных в поток, дней; null — срок курса. */
		accessDays: integer('access_days'),
	},
	(t) => [tenantRef(t, t.courseId, courses, 'cascade'), index().on(t.schoolId, t.courseId)],
)

/** Кураторы потока (4.2): куратор видит учеников и работы только своих потоков. */
export const groupCurators = tenantTable(
	'group_curators',
	{
		groupId: uuid('group_id').notNull(),
		memberId: uuid('member_id').notNull(),
	},
	(t) => [
		tenantRef(t, t.groupId, groups, 'cascade'),
		tenantRef(t, t.memberId, members, 'cascade'),
		uniqueIndex().on(t.schoolId, t.groupId, t.memberId),
		index().on(t.schoolId, t.memberId),
	],
)

/** Зачисление ученика на курс. Одно действующее (active/completed) на пару «участник — курс». */
export const enrollments = tenantTable(
	'enrollments',
	{
		memberId: uuid('member_id').notNull(),
		courseId: uuid('course_id').notNull(),
		status: enrollmentStatus('status').notNull().default('active'),
		source: enrollmentSource('source').notNull().default('manual'),
		enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
		/** Конец доступа; null — без срока. */
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		/** Когда доступ отозван (`revoked`); прогресс сохраняется, «Вернуть доступ» снимает отметку (4.1). */
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		/** Приглашение, по которому зачислен (4.1(б)); без внешнего ключа — приглашения не удаляются, только отзываются. */
		inviteId: uuid('invite_id'),
		/** Поток (4.2); пусто — без потока. */
		groupId: uuid('group_id'),
		progressPct: integer('progress_pct').notNull().default(0),
	},
	(t) => [
		tenantRef(t, t.memberId, members, 'cascade'),
		tenantRef(t, t.courseId, courses, 'cascade'),
		tenantRef(t, t.groupId, groups, 'no action'),
		index().on(t.schoolId, t.groupId),
		uniqueIndex().on(t.schoolId, t.memberId, t.courseId).where(sql`${t.status} in ('active', 'completed')`),
		index().on(t.schoolId, t.courseId),
	],
)

/**
 * Приглашение на курс (4.1(б)): ссылка (`email` пуст, много использований) или адресное (`email`, одно использование, принять
 * может только владелец почты). В БД — только хэш токена; ссылку видно один раз при создании.
 */
export const enrollmentInvites = tenantTable(
	'enrollment_invites',
	{
		courseId: uuid('course_id').notNull(),
		email: pii(text('email')),
		tokenHash: text('token_hash').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		/** Лимит использований; null — без лимита. */
		maxUses: integer('max_uses'),
		uses: integer('uses').notNull().default(0),
		createdByMemberId: uuid('created_by_member_id').notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		/** Поток, в который попадает принявший (4.2); пусто — без потока. */
		groupId: uuid('group_id'),
	},
	(t) => [
		tenantRef(t, t.courseId, courses, 'cascade'),
		tenantRef(t, t.createdByMemberId, members, 'cascade'),
		tenantRef(t, t.groupId, groups, 'no action'),
		index().on(t.schoolId, t.courseId),
	],
)

export const DEADLINE_REMINDER_KINDS = ['soon', 'overdue'] as const
export const deadlineReminderKind = pgEnum('deadline_reminder_kind', DEADLINE_REMINDER_KINDS)

/**
 * Отправленные напоминания о сроке (4.4): «завтра срок» (`soon`) и «срок прошёл» (`overdue`) — каждое один раз на урок
 * ученика; строка пишется в той же транзакции, что и постановка письма.
 */
export const deadlineReminders = tenantTable(
	'deadline_reminders',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		kind: deadlineReminderKind('kind').notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		uniqueIndex().on(t.schoolId, t.enrollmentId, t.lessonId, t.kind),
	],
)

/**
 * Отправленные письма «открылся урок» (4.8): по уроку по расписанию — один раз на ученика; строка пишется в той же транзакции, что
 * и постановка письма.
 */
export const lessonOpenNotices = tenantTable(
	'lesson_open_notices',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		uniqueIndex().on(t.schoolId, t.enrollmentId, t.lessonId),
	],
)

/** Факты по уроку: когда открыт и когда завершён (доступ и статусы — из них и порядка уроков). */
export const lessonProgress = tenantTable(
	'lesson_progress',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		uniqueIndex().on(t.schoolId, t.enrollmentId, t.lessonId),
	],
)

export const BLOCK_RESULTS = ['done', 'failed'] as const
export const blockResult = pgEnum('block_result', BLOCK_RESULTS)

/**
 * Результат блока «оценки» (тест, задание) у ученика (карточка 3.6): `done` — тест сдан с зачётом / задание принято и это
 * не снимается; `failed` — попытка или работа без зачёта (не понижает `done`). По `done` всех блоков `grade` урока
 * завершается урок с правилом `all_blocks`.
 */
export const blockProgress = tenantTable(
	'block_progress',
	{
		enrollmentId: uuid('enrollment_id').notNull(),
		lessonId: uuid('lesson_id').notNull(),
		blockKey: uuid('block_key').notNull(),
		status: blockResult('status').notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
	},
	(t) => [
		tenantRef(t, t.enrollmentId, enrollments, 'cascade'),
		tenantRef(t, t.lessonId, lessons, 'cascade'),
		uniqueIndex().on(t.schoolId, t.enrollmentId, t.lessonId, t.blockKey),
	],
)
