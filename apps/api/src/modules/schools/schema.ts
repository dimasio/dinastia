import { BRANDING_FONTS, BRANDING_RADII, COLOR_SCHEMES } from '@dinastia/contracts/branding'
import { pii, schoolIdColumn, settingsTable, tenantIsolation, tenantRef, tenantTable } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from '#/kernel/auth/schema.ts'
import { memberRole, members } from '#/kernel/members/schema.ts'
import { files } from '#/kernel/storage/schema.ts'

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
		/** Кто пригласил; пусто — оператор Dinastia (приглашение владельца созданной школы, 5.6). */
		invitedBy: uuid('invited_by'),
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

export const brandingFont = pgEnum('branding_font', BRANDING_FONTS)
export const brandingRadius = pgEnum('branding_radius', BRANDING_RADII)
export const colorScheme = pgEnum('color_scheme', COLOR_SCHEMES)

/**
 * Оформление школы (5.9, спека branding.md): строка на школу, нет строки — тема Dinastia. Токены темы строятся из цветов
 * (`@dinastia/contracts/branding`); `version` растёт при каждом изменении — ключ кэша CSS, логотипа и фавикона.
 */
export const schoolBranding = pgTable(
	'school_branding',
	{
		schoolId: schoolIdColumn().primaryKey(),
		logoFileId: uuid('logo_file_id'),
		faviconFileId: uuid('favicon_file_id'),
		primaryColor: text('primary_color'),
		accentColor: text('accent_color'),
		font: brandingFont('font').notNull().default('system'),
		radius: brandingRadius('radius').notNull().default('medium'),
		defaultScheme: colorScheme('default_scheme').notNull().default('system'),
		version: integer('version').notNull().default(1),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		tenantIsolation('school_branding', t.schoolId),
		tenantRef(t, t.logoFileId, files, 'no action'),
		index().on(t.schoolId, t.logoFileId),
		tenantRef(t, t.faviconFileId, files, 'no action'),
		index().on(t.schoolId, t.faviconFileId),
	],
).enableRLS()
