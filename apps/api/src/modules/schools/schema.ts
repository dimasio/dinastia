import { pii, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { pgEnum, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
		tenantRef(t, t.invitedBy, members, 'cascade'),
		uniqueIndex('invitations_pending_email_key').on(t.schoolId, t.email).where(sql`${t.status} = 'pending'`),
	],
)
