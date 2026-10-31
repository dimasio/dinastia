import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Счётчики rate limit процедур (скилл security-baseline): фиксированное окно на ключ. Глобальная таблица без RLS:
 * ключ — имя лимита и хэш субъекта (школа + участник, пользователь или IP), ПДн в открытом виде здесь нет.
 * Лимиты входа и регистрации считает better-auth в своей таблице `rate_limits`.
 */
export const requestLimits = pgTable('request_limits', {
	/** `<имя лимита>:<sha256 субъекта>`. */
	key: text('key').primaryKey(),
	/** Начало текущего окна (выровнено по длине окна). */
	windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
	count: integer('count').notNull(),
})
