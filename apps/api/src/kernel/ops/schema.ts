// Журнал консоли оператора (5.6, D-026): действия вне школы — создание школ, поиск людей. Только добавление: у `app_user`
// нет UPDATE/DELETE (миграция). Действия оператора внутри школы — в её `audit_log` с `actor_operator_id` (5.6г).
import { opaqueJson, pii } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const opsAudit = pgTable(
	'ops_audit',
	{
		id: uuid('id').primaryKey().default(sql`uuidv7()`),
		operatorId: uuid('operator_id').notNull(),
		/** `ops.<сущность>.<действие>`: `ops.school.created`. */
		action: text('action').notNull(),
		schoolId: uuid('school_id'),
		/** Что за запись (id школы, участника); без ПДн. */
		target: text('target'),
		diff: opaqueJson<Record<string, unknown>>('diff'),
		ip: pii(text('ip')),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index().on(t.createdAt), index().on(t.operatorId), index().on(t.schoolId)],
)
