import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id, page, pageInput } from './common/index.ts'

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

export const MySchool = SchoolPublic.extend({
	role: MemberRole,
	url: z.url(),
	/** Приостановлена оператором (5.6в) — видит только владелец. */
	suspended: z.boolean(),
	/** Школа удаляется (видит только владелец): дата удаления; до неё можно отменить (5.5). */
	deleteAt: DateTime.nullable(),
})

/**
 * Реквизиты школы как оператора ПДн (5.5): видит ученик и сотрудник при согласии. `privacyUrl` null — политика по шаблону
 * Dinastia на сайте школы (`/legal/privacy`).
 */
export const SchoolLegal = z.object({
	operator: z.string(),
	contact: z.string().nullable(),
	privacyUrl: z.url().nullable(),
})
export type SchoolLegal = z.infer<typeof SchoolLegal>

/** Принятие приглашения: согласие на обработку ПДн школой обязательно (фиксируется с версией текста и IP). */
export const ConsentGiven = z.object({ consent: z.literal(true) })

/** Аватар участника: назначение файла schools.avatar (сервер) и проверка до загрузки (клиент). */
export const AVATAR = {
	purpose: 'schools.avatar',
	mime: ['image/jpeg', 'image/png', 'image/webp'],
	maxSize: 2 * 1024 * 1024,
} as const

export const Me = z.object({
	user: z.object({ id: Id, email: z.string(), name: z.string() }),
	/** avatarUrl — подписанная ссылка (живёт час), null — аватара нет. */
	member: z.object({ id: Id, role: MemberRole, avatarUrl: z.url().nullable() }),
	school: SchoolPublic,
	/** Разрешения роли — чтобы UI прятал недоступное; запрещает всегда сервер (скилл permissions). */
	permissions: z.array(z.string()),
	/** Школа приостановлена оператором (5.6в) — видит только владелец (остальных не пускает): баннер с причиной. */
	suspension: z.object({ reason: z.string().nullable(), at: DateTime }).nullable(),
	/** Сессия «от имени» (5.6г): вошёл оператор Dinastia — баннер «поддержка Dinastia» с выходом. */
	impersonation: z.object({ operatorEmail: z.string() }).nullable(),
})
export type Me = z.infer<typeof Me>

export const InvitationToken = z.object({ token: z.string().min(20).max(100) })

export const InvitationPublic = z.object({
	email: z.string(),
	role: MemberRole,
	expiresAt: DateTime,
	school: SchoolPublic,
	legal: SchoolLegal,
})

export const schoolsContract = {
	/** Мои школы (корневой домен: выбор школы). */
	mine: oc.route({ method: 'GET', path: '/me/schools' }).output(z.array(MySchool)),
	/** Школа текущего хоста — публично (страница входа, брендинг). */
	current: oc.route({ method: 'GET', path: '/school' }).output(SchoolPublic),
	/** Реквизиты школы как оператора ПДн — публично (страница политики школы, профиль ученика). */
	legal: oc.route({ method: 'GET', path: '/school/legal' }).output(SchoolLegal),
	/** Кто я в школе текущего хоста. */
	me: oc.route({ method: 'GET', path: '/school/me' }).output(Me),
	/**
	 * Удалить школу (только владелец; подтверждение — адрес школы): школа закрывается сразу, через 30 дней все данные и
	 * файлы удаляются; до этого — `cancelDeletion` с корневого домена.
	 */
	requestDeletion: oc
		.route({ method: 'POST', path: '/school/deletion' })
		.input(z.object({ slug: z.string().max(40) }))
		.output(z.object({ deleteAt: DateTime })),
	/** Отменить удаление своей школы (корневой домен, владелец). */
	cancelDeletion: oc
		.route({ method: 'POST', path: '/schools/{id}/cancel-deletion' })
		.input(z.object({ id: Id }))
		.output(MySchool),
	/** Доступ поддержки Dinastia (5.6г): до какого времени оператор может войти от имени участника; null — закрыт. */
	supportAccess: {
		get: oc.route({ method: 'GET', path: '/school/support-access' }).output(z.object({ until: DateTime.nullable() })),
		/** Открыть на 7 дней или закрыть (закрытие сразу отзывает сессии «от имени»). */
		set: oc
			.route({ method: 'POST', path: '/school/support-access' })
			.input(z.object({ open: z.boolean() }))
			.output(z.object({ until: DateTime.nullable() })),
	},
	/** Свой аватар в школе: файл назначения schools.avatar (загружен и подтверждён), null — убрать. */
	updateMyAvatar: oc
		.route({ method: 'POST', path: '/school/me/avatar' })
		.input(z.object({ fileId: Id.nullable() }))
		.output(Me),
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
		.input(InvitationToken.extend(ConsentGiven.shape))
		.output(z.object({ role: MemberRole, school: SchoolPublic })),
}

// --- Сотрудники школы (ресурс, скилл admin-resource) ---

export const MEMBER_STATUSES = ['active', 'blocked'] as const
export const MemberStatus = z.enum(MEMBER_STATUSES)
export const STAFF_ROLES = ['owner', 'admin', 'teacher', 'curator'] as const
export const StaffRole = z.enum(STAFF_ROLES)

export const StaffMember = z.object({
	id: Id,
	userId: Id,
	name: z.string(),
	email: z.string(),
	role: MemberRole,
	status: MemberStatus,
	joinedAt: DateTime,
	avatarUrl: z.url().nullable(),
})
export type StaffMember = z.infer<typeof StaffMember>

export const StaffListInput = pageInput({
	sorts: ['name', 'role', 'joinedAt'] as const,
	defaultSort: 'name',
	filters: { role: StaffRole, status: MemberStatus },
})
export type StaffListInput = z.input<typeof StaffListInput>
export type StaffListQuery = z.output<typeof StaffListInput>

export const membersContract = {
	/** Сотрудники школы (без учеников): поиск по имени и email, фильтры по роли и статусу. */
	list: oc.route({ method: 'GET', path: '/school/members' }).input(StaffListInput).output(page(StaffMember)),
	/** Сменить роль сотрудника (владельцем стать нельзя — только передача владения). */
	changeRole: oc
		.route({ method: 'POST', path: '/school/members/{id}/role' })
		.input(z.object({ id: Id, role: StaffInviteRole }))
		.output(StaffMember),
	/** Заблокировать или вернуть доступ. */
	setStatus: oc
		.route({ method: 'POST', path: '/school/members/{id}/status' })
		.input(z.object({ id: Id, status: MemberStatus }))
		.output(StaffMember),
}
