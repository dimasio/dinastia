// Реализация контракта learn (скилл api-endpoints): процедуры ученика — mw.host → session → school → tenantTx → member
// → can('learning.study'); логика — service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { rateLimit } from '#/kernel/rate-limit/rate-limit.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { can } from '#/permissions.ts'
import { courseAnalytics } from './analytics.service.ts'
import {
	enrollByEmail,
	extendEnrollment,
	listEnrollments,
	moveEnrollment,
	restoreEnrollment,
	revokeEnrollment,
	unlimitEnrollment,
} from './enrollment.service.ts'
import { createGroup, curatorOptions, listGroups, removeGroup, updateGroup } from './groups.service.ts'
import { getMyHome } from './home.service.ts'
import { acceptJoin, createLinkInvite, getJoin, listInvites, revokeInvite } from './invites.service.ts'
import { completeLesson, getMyCourse, getMyLesson, listMyCourses, openLesson } from './service.ts'

const chain = () => impl.learn

export const learnRouter = {
	home: {
		get: chain()
			.home.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ context }) => getMyHome(schoolCtx(context))),
	},
	courses: {
		list: chain()
			.courses.list.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ context }) => listMyCourses(schoolCtx(context))),
		get: chain()
			.courses.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ input, context }) => getMyCourse(schoolCtx(context), input.courseId)),
	},
	lessons: {
		get: chain()
			.lessons.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ input, context }) => getMyLesson(schoolCtx(context), input.lessonId)),
		open: chain()
			.lessons.open.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ input, context }) => openLesson(schoolCtx(context), input.lessonId)),
		complete: chain()
			.lessons.complete.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.study'))
			.handler(({ input, context }) => completeLesson(schoolCtx(context), input.lessonId)),
	},
}

/** Зачисление и доступ (карточка 4.1), потоки (4.2): процедуры сотрудников. */
export const learningRouter = {
	enrollments: {
		list: impl.learning.enrollments.list
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.read'))
			.handler(({ input, context }) => listEnrollments(schoolCtx(context), input)),
		enroll: impl.learning.enrollments.enroll
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => enrollByEmail(schoolCtx(context), input)),
		extend: impl.learning.enrollments.extend
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => extendEnrollment(schoolCtx(context), input)),
		unlimit: impl.learning.enrollments.unlimit
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => unlimitEnrollment(schoolCtx(context), input.id)),
		revoke: impl.learning.enrollments.revoke
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => revokeEnrollment(schoolCtx(context), input.id)),
		restore: impl.learning.enrollments.restore
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => restoreEnrollment(schoolCtx(context), input.id)),
		move: impl.learning.enrollments.move
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.groups.manage'))
			.handler(({ input, context }) => moveEnrollment(schoolCtx(context), input)),
	},
	analytics: {
		course: impl.learning.analytics.course
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.analytics'))
			.handler(({ input, context }) => courseAnalytics(schoolCtx(context), input)),
	},
	groups: {
		list: impl.learning.groups.list
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.read'))
			.handler(({ input, context }) => listGroups(schoolCtx(context), input.courseId)),
		create: impl.learning.groups.create
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.groups.manage'))
			.handler(({ input, context }) => createGroup(schoolCtx(context), input)),
		update: impl.learning.groups.update
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.groups.manage'))
			.handler(({ input, context }) => updateGroup(schoolCtx(context), input)),
		remove: impl.learning.groups.remove
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.groups.manage'))
			.handler(({ input, context }) => removeGroup(schoolCtx(context), input.id)),
		curatorOptions: impl.learning.groups.curatorOptions
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.groups.manage'))
			.handler(({ context }) => curatorOptions(schoolCtx(context))),
	},
	invites: {
		list: impl.learning.invites.list
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => listInvites(schoolCtx(context), input.courseId)),
		create: impl.learning.invites.create
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => createLinkInvite(schoolCtx(context), input)),
		revoke: impl.learning.invites.revoke
			.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('learning.enroll'))
			.handler(({ input, context }) => revokeInvite(schoolCtx(context), input.id)),
	},
}

/** Присоединение по приглашению (4.1(б)): сведения — публично, принятие — вошедшим пользователем (не обязательно участником школы). */
export const joinRouter = {
	get: impl.join.get
		.use(mw.host)
		.use(mw.school)
		.use(mw.tenantTx)
		.handler(({ input, context }) => getJoin(tenantCtx(context.db, context.school, context), input.token)),
	accept: impl.join.accept
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(rateLimit({ name: 'learning.join', max: 20, windowSeconds: 3600, by: 'user' }))
		.handler(({ input, context }) =>
			acceptJoin(tenantCtx(context.db, context.school, context), input.token, context.user),
		),
}
