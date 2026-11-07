// Реализация контракта learn (скилл api-endpoints): процедуры ученика — mw.host → session → school → tenantTx → member
// → can('learning.study'); логика — service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { can } from '#/permissions.ts'
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
