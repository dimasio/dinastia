// Таблицы better-auth (D-007): глобальные, без RLS — человек один на все школы. Членство в школе — modules/schools.
import { pii, schools } from '@dinastia/db'
import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const id = () => uuid('id').primaryKey().default(sql`uuidv7()`)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())

/** Глобальная роль сотрудника Dinastia (D-026); у остальных — null. */
export const platformRole = pgEnum('platform_role', ['operator'])

export const users = pgTable('users', {
	id: id(),
	name: pii(text('name').notNull()),
	email: pii(text('email').notNull().unique()),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: pii(text('image')),
	platformRole: platformRole('platform_role'),
	/** Второй фактор (TOTP) включён — обязателен оператору (5.6); плагин better-auth `twoFactor`. */
	twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
	/** Заглушка обезличенного участника (5.5): без входа, имя «Удалённый слушатель»; не попадает в поиск оператора. */
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
})

export const sessions = pgTable(
	'sessions',
	{
		id: id(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ipAddress: pii(text('ip_address')),
		userAgent: pii(text('user_agent')),
		/** Сессия «от имени» (5.6г): оператор и школа, которой она ограничена; 1 час. */
		impersonatedBy: uuid('impersonated_by'),
		impersonationSchoolId: uuid('impersonation_school_id'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index().on(t.userId)],
)

export const accounts = pgTable(
	'accounts',
	{
		id: id(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index().on(t.userId)],
)

export const verifications = pgTable(
	'verifications',
	{
		id: id(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index().on(t.identifier)],
)

/** Секрет TOTP и резервные коды (better-auth `twoFactor`, 5.6): секрет и коды хранятся зашифрованными ключом AUTH_SECRET. */
export const twoFactors = pgTable(
	'two_factors',
	{
		id: id(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		verified: boolean('verified').notNull().default(true),
		failedVerificationCount: integer('failed_verification_count').notNull().default(0),
		lockedUntil: timestamp('locked_until', { withTimezone: true }),
	},
	(t) => [index().on(t.userId), index().on(t.secret)],
)

export const rateLimits = pgTable('rate_limits', {
	id: id(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

export const consentKind = pgEnum('consent_kind', ['offer', 'privacy', 'pd_processing', 'marketing'])

/** Согласия (D-022, скилл personal-data): кто, на что, какая версия текста, когда, откуда. Только добавление. */
export const consents = pgTable(
	'consents',
	{
		id: id(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
		kind: consentKind('kind').notNull(),
		version: text('version').notNull(),
		ip: pii(text('ip')),
		createdAt: createdAt(),
	},
	(t) => [index().on(t.userId), index().on(t.schoolId)],
)
