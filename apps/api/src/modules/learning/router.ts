// Реализация контракта learn (скилл api-endpoints): процедуры ученика — mw.host → session → school → tenantTx → member
// → can('learning.study'); логика — service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { can } from '#/permissions.ts'
import {
	enrollByEmail,
	extendEnrollment,
	listEnrollments,
	restoreEnrollment,
	revokeEnrollment,
	unlimitEnrollment,
} from './enrollment.service.ts'
import { completeLesson, getMyCourse, getMyLesson, listMyCourses, openLesson } from './service.ts'

const chain = () => impl.learn

export const learnRouter = {
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

/** Зачисление и доступ (карточка 4.1): процедуры сотрудников. */
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
	},
}
