// Таблицы модуля learning (скилл db-schema, domain.md §1 «Обучение»). В 2.6 — сокращённо: зачисление и факты
// прохождения уроков; потоки, дедлайны, `lesson_progress.status` — фаза 4 (доступность считается при чтении).
import { tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, integer, pgEnum, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { members } from '#/kernel/members/schema.ts'
import { courses, lessons } from '../courses/schema.ts'

export const ENROLLMENT_STATUSES = ['active', 'completed', 'expired', 'revoked'] as const
export const ENROLLMENT_SOURCES = ['manual', 'invite', 'link'] as const
export const enrollmentStatus = pgEnum('enrollment_status', ENROLLMENT_STATUSES)
export const enrollmentSource = pgEnum('enrollment_source', ENROLLMENT_SOURCES)

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
		progressPct: integer('progress_pct').notNull().default(0),
	},
	(t) => [
		tenantRef(t, t.memberId, members, 'cascade'),
		tenantRef(t, t.courseId, courses, 'cascade'),
		uniqueIndex().on(t.schoolId, t.memberId, t.courseId).where(sql`${t.status} in ('active', 'completed')`),
		index().on(t.schoolId, t.courseId),
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
