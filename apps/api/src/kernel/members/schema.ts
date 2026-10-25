// Членство в школе — часть ядра: оно нужно контексту каждого запроса (orpc.ts). Логика приглашений — modules/schools.
import { appUser, currentSchoolId, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, pgEnum, pgPolicy, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from '../auth/schema.ts'
import { files } from '../storage/schema.ts'

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'teacher', 'curator', 'student'])
export const memberStatus = pgEnum('member_status', ['active', 'blocked'])

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
		/** Аватар участника в этой школе (файл назначения schools.avatar). */
		avatarFileId: uuid('avatar_file_id'),
	},
	(t) => [
		uniqueIndex().on(t.schoolId, t.userId),
		index().on(t.userId),
		tenantRef(t, t.invitedBy, t, 'no action'),
		tenantRef(t, t.avatarFileId, files, 'no action'),
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
