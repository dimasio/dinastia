// Контракт модуля learning (скилл api-endpoints, lms-learners): область ученика `learn.*` — свои курсы, оглавление,
// урок и отметки прохождения. Карточка — docs/tasks/phase-2-courses/changes/2.6-player.md.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Email, Id, page, pageInput } from './common/index.ts'
import { LESSON_COMPLETION_RULES } from './courses.ts'
import { ConsentGiven, SchoolLegal, SchoolPublic } from './schools.ts'

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
	/** Куда ведёт «Продолжить» (4.5): первый доступный незавершённый урок; у закрытого курса и пройденного целиком — null. */
	nextLessonId: Id.nullable(),
	/** До какого момента открыт доступ (4.5); null — без срока. */
	expiresAt: DateTime.nullable(),
	/** Когда курс пройден (4.5); null — ещё нет. */
	completedAt: DateTime.nullable(),
	/** Опубликованных уроков в курсе и пройденных учеником (4.5). */
	lessonsTotal: z.number().int().min(0),
	lessonsCompleted: z.number().int().min(0),
})
export type MyCourse = z.infer<typeof MyCourse>

/** Урок со сроком в кабинете ученика (4.5). */
export const HomeDeadline = z.object({
	courseId: Id,
	courseTitle: z.string(),
	lessonId: Id,
	lessonTitle: z.string(),
	dueAt: DateTime,
	overdue: z.boolean(),
})
export type HomeDeadline = z.infer<typeof HomeDeadline>

/** Сводка кабинета ученика (4.5): где продолжить и ближайшие сроки по действующим курсам. */
export const LearnHome = z.object({
	/** Курс, где ученик был последним, и его следующий урок; null — продолжать нечего. */
	continue: z
		.object({
			courseId: Id,
			courseTitle: z.string(),
			coverUrl: z.string().nullable(),
			progressPct: z.number().int().min(0).max(100),
			lessonId: Id,
			lessonTitle: z.string(),
		})
		.nullable(),
	/** Просроченные и со сроком в ближайшие 14 дней незавершённые доступные уроки, по сроку; до 10. */
	deadlines: z.array(HomeDeadline),
})
export type LearnHome = z.infer<typeof LearnHome>

export const OutlineLesson = z.object({
	id: Id,
	title: z.string(),
	status: LessonStatus,
	lockedBy: LockedBy.nullable(),
	/** Срок сдачи (4.4); пусто — без срока. */
	dueAt: DateTime.nullable(),
	/** Срок прошёл, урок не завершён (урок не закрывается). */
	overdue: z.boolean(),
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
		dueAt: DateTime.nullable(),
		overdue: z.boolean(),
	}),
	blocks: z.array(PlayerBlock),
	prev: NavLesson.nullable(),
	next: NavLesson.nullable(),
})
export type PlayerLesson = z.infer<typeof PlayerLesson>

const LessonById = z.object({ lessonId: Id })
const LessonState = z.object({ status: LessonStatus, progressPct: z.number().int().min(0).max(100) })

export const learnContract = {
	/** Сводка кабинета ученика (4.5). */
	home: { get: oc.route({ method: 'GET', path: '/learn/home' }).output(LearnHome) },
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
	/** Пройдено опубликованных уроков из всех (4.6). */
	lessonsCompleted: z.number().int().min(0),
	lessonsTotal: z.number().int().min(0),
	/** Незавершённых уроков с прошедшим сроком (4.6); у закрытого доступа — 0. */
	overdueCount: z.number().int().min(0),
	/** Последнее открытие или завершение урока (4.6); пусто — ещё не начинал. */
	lastActivityAt: DateTime.nullable(),
})
export type EnrollmentRow = z.infer<typeof EnrollmentRow>

/** Фильтр списка учеников по потоку: id потока или `none` — без потока. */
export const GROUP_NONE = 'none'
export const GroupFilter = z.union([Id, z.literal(GROUP_NONE)])

export const EnrollmentListInput = pageInput({
	sorts: ['enrolledAt', 'studentName', 'progressPct', 'lastActivityAt'] as const,
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

/** Аналитика курса (4.6): по потоку или по всем видимым сотруднику ученикам. */
export const CourseAnalyticsInput = z.object({ courseId: Id, groupId: GroupFilter.optional() })
export type CourseAnalyticsInput = z.infer<typeof CourseAnalyticsInput>

export const CourseAnalytics = z.object({
	summary: z.object({
		/** Ученики курса без отозванных — база процентов. */
		learners: z.number().int(),
		/** Учатся (доступ открыт, курс не пройден), прошли, доступ закончился. */
		learning: z.number().int(),
		completed: z.number().int(),
		expired: z.number().int(),
		avgProgressPct: z.number().int().min(0).max(100),
		/** Учеников хотя бы с одной просрочкой. */
		withOverdue: z.number().int(),
	}),
	/** Воронка: опубликованные уроки по порядку курса. */
	lessons: z.array(
		z.object({
			lessonId: Id,
			title: z.string(),
			sectionTitle: z.string(),
			opened: z.number().int(),
			completed: z.number().int(),
			overdue: z.number().int(),
		}),
	),
})
export type CourseAnalytics = z.infer<typeof CourseAnalytics>

export const learningContract = {
	analytics: {
		/** Сводка и воронка по урокам; куратор — только свои потоки. Курс без публикации — `COURSE_NOT_FOUND`. */
		course: oc
			.route({ method: 'GET', path: '/courses/{courseId}/analytics' })
			.input(CourseAnalyticsInput)
			.output(CourseAnalytics),
	},
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
	legal: SchoolLegal,
})

export const joinContract = {
	get: oc.route({ method: 'GET', path: '/join/{token}' }).input(JoinToken).output(JoinPublic),
	/** Принять приглашение вошедшим пользователем: становится учеником школы и зачисляется на курс. */
	accept: oc
		.route({ method: 'POST', path: '/join/{token}/accept' })
		.input(JoinToken.extend(ConsentGiven.shape))
		.output(z.object({ courseId: Id, school: SchoolPublic })),
}

// --- Ученики школы (5.5, ресурс): данные по запросу ученика — выгрузить и удалить ---

/** `deleted` — обезличенный ученик: имя «Удалённый слушатель», данных нет. */
export const STUDENT_STATUSES = ['active', 'blocked', 'deleted'] as const
export const StudentStatus = z.enum(STUDENT_STATUSES)

export const SchoolStudent = z.object({
	id: Id,
	name: z.string(),
	/** У обезличенного — пусто. */
	email: z.string().nullable(),
	status: StudentStatus,
	/** Курсов, на которые зачислен (любой статус зачисления). */
	courses: z.number().int(),
	joinedAt: DateTime,
})
export type SchoolStudent = z.infer<typeof SchoolStudent>

export const StudentListInput = pageInput({
	sorts: ['name', 'joinedAt'] as const,
	defaultSort: 'joinedAt',
	filters: { status: StudentStatus },
})
export type StudentListQuery = z.output<typeof StudentListInput>

/** Ключ выгрузки данных ученика (zip): `exports.start({ key, input: { memberId } })`; без memberId — свои данные. */
export const MEMBER_DATA_EXPORT = 'learning.member-data'

export const studentsContract = {
	/** Ученики школы: поиск по имени и email, фильтр по статусу. */
	list: oc.route({ method: 'GET', path: '/school/students' }).input(StudentListInput).output(page(SchoolStudent)),
	/**
	 * Удалить данные ученика (обезличить, необратимо): файлы и тексты удаляются, оценки и прогресс остаются, сертификаты
	 * аннулируются. Только для учеников.
	 */
	anonymize: oc
		.route({ method: 'POST', path: '/school/students/{id}/anonymize' })
		.input(z.object({ id: Id }))
		.output(SchoolStudent),
}
