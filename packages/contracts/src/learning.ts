// Контракт модуля learning (скилл api-endpoints, lms-learners): область ученика `learn.*` — свои курсы, оглавление,
// урок и отметки прохождения. Карточка — docs/tasks/phase-2-courses/changes/2.6-player.md.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id, page, pageInput } from './common/index.ts'
import { LESSON_COMPLETION_RULES } from './courses.ts'
import { SchoolPublic } from './schools.ts'

export const LESSON_STATUSES = ['locked', 'available', 'in_progress', 'completed'] as const
export const LessonStatus = z.enum(LESSON_STATUSES)

/** Чем закрыт урок: другим уроком (последовательно) или датой (по расписанию). */
export const LockedBy = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('lesson'), lessonId: Id, title: z.string() }),
	z.object({ kind: z.literal('date'), at: DateTime }),
])
export type LockedBy = z.infer<typeof LockedBy>

/** Курс ученика в списке «Мои курсы». */
export const MyCourse = z.object({
	id: Id,
	title: z.string(),
	slug: z.string(),
	coverUrl: z.string().nullable(),
	progressPct: z.number().int().min(0).max(100),
	/** Доступ закончился (срок вышел) — курс виден, уроки закрыты. */
	expired: z.boolean(),
	/** Доступ отозван школой (4.1) — курс виден, уроки закрыты. */
	revoked: z.boolean(),
})
export type MyCourse = z.infer<typeof MyCourse>

export const OutlineLesson = z.object({
	id: Id,
	title: z.string(),
	status: LessonStatus,
	lockedBy: LockedBy.nullable(),
})
export const CourseOutline = z.object({
	course: MyCourse,
	sections: z.array(z.object({ id: Id, title: z.string(), lessons: z.array(OutlineLesson) })),
	/** Куда вести «Продолжить»: первый незавершённый доступный урок; null — всё пройдено или нечего открывать. */
	nextLessonId: Id.nullable(),
})
export type CourseOutline = z.infer<typeof CourseOutline>

/** Блок урока глазами ученика — данные только через `toPublic` типа; файлы — подписанные ссылки. */
export const PlayerBlock = z.object({
	id: Id,
	blockKey: Id,
	type: z.string(),
	isRequired: z.boolean(),
	data: z.unknown(),
	files: z.record(
		z.string(),
		z.object({ url: z.string(), name: z.string(), mime: z.string(), size: z.number().int() }),
	),
})
export type PlayerBlock = z.infer<typeof PlayerBlock>

const NavLesson = z.object({ id: Id, title: z.string(), locked: z.boolean() })

export const PlayerLesson = z.object({
	lesson: z.object({
		id: Id,
		courseId: Id,
		courseTitle: z.string(),
		title: z.string(),
		completionRule: z.enum(LESSON_COMPLETION_RULES),
		status: LessonStatus,
	}),
	blocks: z.array(PlayerBlock),
	prev: NavLesson.nullable(),
	next: NavLesson.nullable(),
})
export type PlayerLesson = z.infer<typeof PlayerLesson>

const LessonById = z.object({ lessonId: Id })
const LessonState = z.object({ status: LessonStatus, progressPct: z.number().int().min(0).max(100) })

export const learnContract = {
	courses: {
		list: oc.route({ method: 'GET', path: '/learn/courses' }).output(z.array(MyCourse)),
		get: oc
			.route({ method: 'GET', path: '/learn/courses/{courseId}' })
			.input(z.object({ courseId: Id }))
			.output(CourseOutline),
	},
	lessons: {
		/** Закрытый урок — `LESSON_LOCKED` (с `lockedBy`); чужой, неопубликованный, без зачисления — `LESSON_NOT_FOUND`. */
		get: oc.route({ method: 'GET', path: '/learn/lessons/{lessonId}' }).input(LessonById).output(PlayerLesson),
		/** Ученик открыл урок; по правилу `view` урок сразу завершён. */
		open: oc.route({ method: 'POST', path: '/learn/lessons/{lessonId}/open' }).input(LessonById).output(LessonState),
		/** Завершить урок (кнопка при правиле `manual`); повтор — без изменений. */
		complete: oc
			.route({ method: 'POST', path: '/learn/lessons/{lessonId}/complete' })
			.input(LessonById)
			.output(LessonState),
	},
}

// ── Зачисление (карточка 4.1): namespace `learning`, процедуры сотрудников ────────────────────────────────────────────
export const ENROLLMENT_STATUSES = ['active', 'completed', 'expired', 'revoked'] as const
export const EnrollmentStatus = z.enum(ENROLLMENT_STATUSES)
export const ENROLLMENT_SOURCES = ['manual', 'invite', 'link'] as const
export const ACCESS_DAYS = z.number().int().min(1).max(3650)

/** Строка списка учеников курса; статус — с учётом срока (просроченный показывается «истёк» ещё до задачи). */
export const EnrollmentRow = z.object({
	id: Id,
	studentName: z.string(),
	studentEmail: z.string(),
	status: EnrollmentStatus,
	source: z.enum(ENROLLMENT_SOURCES),
	enrolledAt: DateTime,
	/** Конец доступа; пусто — без срока. */
	expiresAt: DateTime.nullable(),
	progressPct: z.number().int().min(0).max(100),
	/** Поток (4.2); пусто — без потока. */
	groupId: Id.nullable(),
	groupTitle: z.string().nullable(),
})
export type EnrollmentRow = z.infer<typeof EnrollmentRow>

/** Фильтр списка учеников по потоку: id потока или `none` — без потока. */
export const GROUP_NONE = 'none'
export const GroupFilter = z.union([Id, z.literal(GROUP_NONE)])

export const EnrollmentListInput = pageInput({
	sorts: ['enrolledAt', 'studentName', 'progressPct'] as const,
	defaultSort: 'enrolledAt',
	defaultDir: 'desc',
	filters: { status: EnrollmentStatus, groupId: GroupFilter },
}).extend({ courseId: Id })
export type EnrollmentListQuery = z.output<typeof EnrollmentListInput>

export const EnrollInput = z.object({
	courseId: Id,
	email: Email,
	/** Срок доступа в днях; не указан — срок курса по умолчанию. */
	accessDays: ACCESS_DAYS.optional(),
	/** Имя — для нового аккаунта (его создают владелец и администраторы); не указано — часть почты до «@». */
	name: z.string().trim().min(1).max(100).optional(),
	/** Поток курса (4.2); не указан — без потока. */
	groupId: Id.optional(),
})

const ById = z.object({ id: Id })

export const INVITE_STATUSES = ['active', 'expired', 'revoked', 'exhausted'] as const
/** Приглашение на курс в списке: ссылка (`email` пуст) или адресное. */
export const InviteRow = z.object({
	id: Id,
	email: z.string().nullable(),
	status: z.enum(INVITE_STATUSES),
	expiresAt: DateTime,
	maxUses: z.number().int().nullable(),
	uses: z.number().int(),
	createdAt: DateTime,
	/** Поток, в который попадает принявший (4.2). */
	groupId: Id.nullable(),
	groupTitle: z.string().nullable(),
})
export type InviteRow = z.infer<typeof InviteRow>

export const InviteCreateInput = z.object({
	courseId: Id,
	/** Срок действия ссылки, дней (по умолчанию 30). */
	expiresInDays: z.number().int().min(1).max(365).default(30),
	/** Сколько человек могут присоединиться; не указан — без лимита. */
	maxUses: z.number().int().min(1).max(10000).optional(),
	/** Поток, в который попадает принявший (4.2); не указан — без потока. */
	groupId: Id.optional(),
})

// ── Потоки (карточка 4.2) ─────────────────────────────────────────────────────────────────────────────────────────────
export const GroupTitle = z.string().trim().min(1).max(120)

/** Сотрудник — куратор потока или кандидат в кураторы. */
export const GroupCurator = z.object({ memberId: Id, name: z.string(), email: z.string() })
export type GroupCurator = z.infer<typeof GroupCurator>

/** Поток курса в списке вкладки «Потоки». */
export const GroupRow = z.object({
	id: Id,
	courseId: Id,
	title: z.string(),
	startsAt: DateTime.nullable(),
	/** Для информации — доступ не ограничивает. */
	endsAt: DateTime.nullable(),
	/** Срок доступа зачисленных в поток, дней; пусто — срок курса. */
	accessDays: z.number().int().nullable(),
	students: z.number().int(),
	curators: z.array(GroupCurator),
})
export type GroupRow = z.infer<typeof GroupRow>

const GroupFields = z.object({
	title: GroupTitle,
	startsAt: DateTime.nullable().default(null),
	endsAt: DateTime.nullable().default(null),
	accessDays: ACCESS_DAYS.nullable().default(null),
	/** Кураторы — участники школы (не ученики), до 20. */
	curatorIds: z.array(Id).max(20).default([]),
})
export const GroupCreateInput = GroupFields.extend({ courseId: Id })
export type GroupCreateInput = z.output<typeof GroupCreateInput>
export const GroupUpdateInput = GroupFields.extend({ id: Id })
export type GroupUpdateInput = z.output<typeof GroupUpdateInput>

export const learningContract = {
	enrollments: {
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/enrollments' })
			.input(EnrollmentListInput)
			.output(page(EnrollmentRow)),
		/**
		 * Зачислить ученика школы по почте; повтор по действующему — то же зачисление, отозванное и истёкшее — возвращается.
		 * Незнакомая почта: владелец и администратор создают аккаунт, преподаватель — шлёт приглашение (`invited`, без зачисления).
		 */
		enroll: oc
			.route({ method: 'POST', path: '/courses/{courseId}/enrollments', successStatus: 201 })
			.input(EnrollInput)
			.output(
				z.object({
					outcome: z.enum(['enrolled', 'restored', 'already', 'invited']),
					enrollment: EnrollmentRow.nullable(),
				}),
			),
		/** Продлить доступ на `accessDays` дней от конца текущего срока (или от сегодня, если он вышел). */
		extend: oc
			.route({ method: 'POST', path: '/enrollments/{id}/extend' })
			.input(ById.extend({ accessDays: ACCESS_DAYS }))
			.output(EnrollmentRow),
		/** Снять срок: доступ без ограничения по времени. */
		unlimit: oc.route({ method: 'POST', path: '/enrollments/{id}/unlimit' }).input(ById).output(EnrollmentRow),
		/** Отозвать доступ (прогресс сохраняется). */
		revoke: oc.route({ method: 'POST', path: '/enrollments/{id}/revoke' }).input(ById).output(EnrollmentRow),
		restore: oc.route({ method: 'POST', path: '/enrollments/{id}/restore' }).input(ById).output(EnrollmentRow),
		/** Перевести в поток курса или убрать из потока (`groupId: null`); срок и прогресс не меняются. */
		move: oc
			.route({ method: 'POST', path: '/enrollments/{id}/move' })
			.input(ById.extend({ groupId: Id.nullable() }))
			.output(EnrollmentRow),
	},
	groups: {
		/** Потоки курса; куратор видит только свои. */
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/groups' })
			.input(z.object({ courseId: Id }))
			.output(z.array(GroupRow)),
		create: oc
			.route({ method: 'POST', path: '/courses/{courseId}/groups', successStatus: 201 })
			.input(GroupCreateInput)
			.output(GroupRow),
		/** Изменить поток целиком (кураторы — новым списком). */
		update: oc.route({ method: 'PUT', path: '/groups/{id}' }).input(GroupUpdateInput).output(GroupRow),
		/** Удалить поток: ученики и ссылки остаются в курсе без потока. */
		remove: oc
			.route({ method: 'DELETE', path: '/groups/{id}' })
			.input(ById)
			.output(z.object({ id: Id })),
		/** Кого можно назначить куратором: активные сотрудники школы. */
		curatorOptions: oc.route({ method: 'GET', path: '/groups/curator-options' }).output(z.array(GroupCurator)),
	},
	invites: {
		list: oc
			.route({ method: 'GET', path: '/courses/{courseId}/invites' })
			.input(z.object({ courseId: Id }))
			.output(z.array(InviteRow)),
		/** Создать ссылку-приглашение; сама ссылка (`url`) видна только в этом ответе. */
		create: oc
			.route({ method: 'POST', path: '/courses/{courseId}/invites', successStatus: 201 })
			.input(InviteCreateInput)
			.output(z.object({ invite: InviteRow, url: z.url() })),
		revoke: oc.route({ method: 'POST', path: '/invites/{id}/revoke' }).input(ById).output(InviteRow),
	},
}

// ── Присоединение по приглашению (4.1(б)): публично, страница /join/<токен> ────────────────────────────────────────────
export const JoinToken = z.object({ token: z.string().min(20).max(100) })

export const JoinPublic = z.object({
	school: SchoolPublic,
	courseTitle: z.string(),
	/** Для адресного приглашения — почта, на которую оно выписано; для ссылки — пусто. */
	email: z.string().nullable(),
	expiresAt: DateTime,
})

export const joinContract = {
	get: oc.route({ method: 'GET', path: '/join/{token}' }).input(JoinToken).output(JoinPublic),
	/** Принять приглашение вошедшим пользователем: становится учеником школы и зачисляется на курс. */
	accept: oc
		.route({ method: 'POST', path: '/join/{token}/accept' })
		.input(JoinToken)
		.output(z.object({ courseId: Id, school: SchoolPublic })),
}
