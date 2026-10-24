import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id } from './common/index.ts'

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

export const SchoolCreate = z.object({ name: SchoolName, slug: SchoolSlug })
export type SchoolCreate = z.infer<typeof SchoolCreate>

export const StaffInvite = z.object({ email: Email, role: StaffInviteRole })
export type StaffInvite = z.infer<typeof StaffInvite>

// --- Контракт (скилл api-endpoints) ---

export const SchoolPublic = z.object({ id: Id, slug: z.string(), name: z.string() })
export type SchoolPublic = z.infer<typeof SchoolPublic>

export const MySchool = SchoolPublic.extend({ role: MemberRole, url: z.url() })

export const Me = z.object({
	user: z.object({ id: Id, email: z.string(), name: z.string() }),
	member: z.object({ id: Id, role: MemberRole }),
	school: SchoolPublic,
})
export type Me = z.infer<typeof Me>

export const InvitationToken = z.object({ token: z.string().min(20).max(100) })

export const InvitationPublic = z.object({
	email: z.string(),
	role: MemberRole,
	expiresAt: DateTime,
	school: SchoolPublic,
})

export const schoolsContract = {
	/** Зарегистрировать школу (корневой домен, вошедший пользователь становится владельцем). */
	create: oc.route({ method: 'POST', path: '/schools', successStatus: 201 }).input(SchoolCreate).output(MySchool),
	/** Мои школы (корневой домен: выбор школы). */
	mine: oc.route({ method: 'GET', path: '/me/schools' }).output(z.array(MySchool)),
	/** Школа текущего хоста — публично (страница входа, брендинг). */
	current: oc.route({ method: 'GET', path: '/school' }).output(SchoolPublic),
	/** Кто я в школе текущего хоста. */
	me: oc.route({ method: 'GET', path: '/school/me' }).output(Me),
}

export const invitationsContract = {
	/** Пригласить сотрудника в школу текущего хоста. Токен уходит только письмом. */
	create: oc
		.route({ method: 'POST', path: '/school/invitations', successStatus: 201 })
		.input(StaffInvite)
		.output(z.object({ id: Id, expiresAt: DateTime })),
	/** Сведения о приглашении для страницы /invite/<token> — публично. */
	get: oc.route({ method: 'GET', path: '/invitations/{token}' }).input(InvitationToken).output(InvitationPublic),
	/** Принять приглашение вошедшим пользователем (email сессии = email приглашения). */
	accept: oc
		.route({ method: 'POST', path: '/invitations/{token}/accept' })
		.input(InvitationToken)
		.output(z.object({ role: MemberRole, school: SchoolPublic })),
}
