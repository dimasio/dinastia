import { sql } from 'drizzle-orm'
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const schoolStatus = pgEnum('school_status', ['active', 'suspended', 'deleted'])

/**
 * Школа — корень тенанта (D-006). Глобальная таблица без RLS: по ней ядро определяет школу по хосту запроса.
 * Пишет в неё только ядро; продуктовые модули читают школу из контекста (`ctx.school`).
 */
export const schools = pgTable('schools', {
	id: uuid('id').primaryKey().default(sql`uuidv7()`),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	status: schoolStatus('status').notNull().default('active'),
	timezone: text('timezone').notNull().default('Europe/Moscow'),
	locale: text('locale').notNull().default('ru'),
	deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
})
