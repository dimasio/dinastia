import { z } from 'zod'

/** Поддомены, которые не может занять школа (скилл lms-school). */
export const RESERVED_SLUGS = [
	'www',
	'api',
	'app',
	'admin',
	'ops',
	'mail',
	'smtp',
	'static',
	'cdn',
	'files',
	'assets',
	'help',
	'support',
	'status',
	'docs',
	'blog',
	'auth',
	'login',
	'register',
	'dinastia',
	'test',
	'staging',
	'stage',
	'dev',
] as const

export const SchoolSlug = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, 'SLUG_FORMAT')
	.refine((s) => !s.includes('--'), 'SLUG_FORMAT')
	.refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'SLUG_RESERVED')

export const SchoolName = z.string().trim().min(2).max(100)

export const MEMBER_ROLES = ['owner', 'admin', 'teacher', 'curator', 'student'] as const
export const MemberRole = z.enum(MEMBER_ROLES)
export type MemberRole = z.infer<typeof MemberRole>

/** Роли, в которые приглашают сотрудников; ученики попадают в школу через зачисление (скилл lms-learners). */
export const STAFF_INVITE_ROLES = ['admin', 'teacher', 'curator'] as const
export const StaffInviteRole = z.enum(STAFF_INVITE_ROLES)

export const Email = z.string().trim().toLowerCase().pipe(z.email())

export const SchoolCreate = z.object({ name: SchoolName, slug: SchoolSlug })
export type SchoolCreate = z.infer<typeof SchoolCreate>

export const StaffInvite = z.object({ email: Email, role: StaffInviteRole })
export type StaffInvite = z.infer<typeof StaffInvite>
