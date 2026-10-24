import { appUser, currentSchoolId, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, pgEnum, pgPolicy, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from '#/kernel/auth/schema.ts'

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'teacher', 'curator', 'student'])
export const memberStatus = pgEnum('member_status', ['active', 'blocked'])
export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])

/** Текущий пользователь транзакции (`withTenant`/`withUser`). */
const currentUserId = sql`nullif(current_setting('app.user_id', true), '')::uuid`

/** Участник школы (D-006): одна роль на членство. Вне школы пользователь видит свои членства (список своих школ). */
export const members = tenantTable(
	'members',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		role: memberRole('role').notNull(),
		status: memberStatus('status').notNull().default('active'),
		invitedBy: uuid('invited_by'),
		joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex().on(t.schoolId, t.userId),
		index().on(t.userId),
		tenantRef(t, t.invitedBy, t, 'no action'),
		// Только вне школы (withUser): иначе политики сложились бы через OR и в школе A были бы видны членства
		// пользователя в других школах — findActiveMember выдал бы чужую роль.
		pgPolicy('members_own_memberships', {
			as: 'permissive',
			for: 'select',
			to: appUser,
			using: sql`${currentSchoolId} is null and ${t.userId} = ${currentUserId}`,
		}),
	],
)

/** Приглашение сотрудника: в БД — только хеш токена; повторное приглашение того же email обновляет срок. */
export const invitations = tenantTable(
	'invitations',
	{
		email: text('email').notNull(),
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
