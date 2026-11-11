import { pii, settingsTable, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, pgEnum, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from '#/kernel/auth/schema.ts'
import { memberRole, members } from '#/kernel/members/schema.ts'

export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])

/** Приглашение сотрудника: в БД — только хеш токена; повторное приглашение того же email обновляет срок. */
export const invitations = tenantTable(
	'invitations',
	{
		email: pii(text('email').notNull()),
		role: memberRole('role').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		status: invitationStatus('status').notNull().default('pending'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		invitedBy: uuid('invited_by').notNull(),
		acceptedAt: timestamp('accepted_at', { withTimezone: true }),
		acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => [
		index().on(t.acceptedByUserId),
		tenantRef(t, t.invitedBy, members, 'cascade'),
		index().on(t.schoolId, t.invitedBy),
		uniqueIndex('invitations_pending_email_key').on(t.schoolId, t.email).where(sql`${t.status} = 'pending'`),
	],
)

/**
 * Настройки школы (скилл settings, D-036). Юридическое (5.5): школа — оператор ПДн своих учеников; реквизиты видит ученик
 * при согласии на обработку ПДн. Пусто — подставляется название школы и политика по шаблону Dinastia (`/legal/privacy`).
 */
export const schoolsSettingsTable = settingsTable('schools_settings', {
	/** Оператор ПДн — организация или ИП (название, ИНН). */
	pdOperator: text('pd_operator').notNull().default(''),
	/** Почта для запросов учеников по их данным (выгрузка, удаление). */
	pdContact: text('pd_contact').notNull().default(''),
	/** Своя политика обработки ПДн школы (https); пусто — шаблон Dinastia с реквизитами школы. */
	privacyUrl: text('privacy_url').notNull().default(''),
})
