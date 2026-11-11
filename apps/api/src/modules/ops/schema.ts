import { pii, schools } from '@dinastia/db'
import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Метрики школ для списка в консоли оператора (5.6б): пересчитывает задача `ops.school-stats` раз в час в транзакции каждой
 * школы; глобальная (без RLS) — читает только консоль. Без ПДн учеников: числа, даты и почта владельца (клиент Dinastia).
 */
export const schoolStats = pgTable('school_stats', {
	schoolId: uuid('school_id')
		.primaryKey()
		.references(() => schools.id, { onDelete: 'cascade' }),
	/** Ученики школы, кроме удалённых (5.5). */
	students: integer('students').notNull().default(0),
	/** Открывали урок за 30 дней. */
	activeStudents30d: integer('active_students_30d').notNull().default(0),
	/** Курсы, кроме архивных. */
	courses: integer('courses').notNull().default(0),
	storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
	ownerEmail: pii(text('owner_email')),
	lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
