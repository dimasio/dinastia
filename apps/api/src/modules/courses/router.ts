// Реализация контракта courses (скилл api-endpoints): процедуры участника — mw.host → session → school → tenantTx →
// member → can(…); логика — service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { can } from '#/permissions.ts'
import {
	addLessonBlock,
	getLesson,
	listLessonBlocks,
	moveLessonBlock,
	removeLessonBlock,
	updateLessonBlock,
} from './blocks.service.ts'
import { publishCourse, publishCourseChanges, publishLesson } from './publish.service.ts'
import {
	archiveCourse,
	createCourse,
	createLesson,
	createSection,
	getCourse,
	listCourses,
	moveLesson,
	moveSection,
	removeCourse,
	removeLesson,
	removeSection,
	renameLesson,
	renameSection,
	updateCourse,
} from './service.ts'
import { refreshVideo, startVideoUpload } from './video.service.ts'

const chain = () => impl.courses

export const coursesRouter = {
	list: chain()
		.list.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.read'))
		.handler(({ input, context }) => listCourses(schoolCtx(context), input)),
	get: chain()
		.get.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.read'))
		.handler(({ input, context }) => getCourse(schoolCtx(context), input.id)),
	create: chain()
		.create.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.manage'))
		.handler(({ input, context }) => createCourse(schoolCtx(context), input)),
	update: chain()
		.update.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.manage'))
		.handler(({ input, context }) => updateCourse(schoolCtx(context), input)),
	archive: chain()
		.archive.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.manage'))
		.handler(({ input, context }) => archiveCourse(schoolCtx(context), input.id)),
	remove: chain()
		.remove.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.manage'))
		.handler(({ input, context }) => removeCourse(schoolCtx(context), input.id)),
	publish: chain()
		.publish.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.publish'))
		.handler(({ input, context }) => publishCourse(schoolCtx(context), input.id)),
	publishChanges: chain()
		.publishChanges.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('courses.publish'))
		.handler(({ input, context }) => publishCourseChanges(schoolCtx(context), input.id)),

	sections: {
		create: chain()
			.sections.create.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => createSection(schoolCtx(context), input)),
		rename: chain()
			.sections.rename.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => renameSection(schoolCtx(context), input)),
		move: chain()
			.sections.move.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => moveSection(schoolCtx(context), input)),
		remove: chain()
			.sections.remove.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => removeSection(schoolCtx(context), input.id)),
	},

	lessons: {
		create: chain()
			.lessons.create.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => createLesson(schoolCtx(context), input)),
		rename: chain()
			.lessons.rename.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => renameLesson(schoolCtx(context), input)),
		move: chain()
			.lessons.move.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => moveLesson(schoolCtx(context), input)),
		remove: chain()
			.lessons.remove.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => removeLesson(schoolCtx(context), input.id)),
		get: chain()
			.lessons.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.read'))
			.handler(({ input, context }) => getLesson(schoolCtx(context), input.id)),
		publish: chain()
			.lessons.publish.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.publish'))
			.handler(({ input, context }) => publishLesson(schoolCtx(context), input.id)),
	},

	blocks: {
		list: chain()
			.blocks.list.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.read'))
			.handler(({ input, context }) => listLessonBlocks(schoolCtx(context), input.lessonId)),
		create: chain()
			.blocks.create.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => addLessonBlock(schoolCtx(context), input)),
		update: chain()
			.blocks.update.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => updateLessonBlock(schoolCtx(context), input)),
		move: chain()
			.blocks.move.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => moveLessonBlock(schoolCtx(context), input)),
		startVideoUpload: chain()
			.blocks.startVideoUpload.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => startVideoUpload(schoolCtx(context), input)),
		videoStatus: chain()
			.blocks.videoStatus.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.read'))
			.handler(({ input, context }) => refreshVideo(schoolCtx(context), input.id)),
		remove: chain()
			.blocks.remove.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('courses.manage'))
			.handler(({ input, context }) => removeLessonBlock(schoolCtx(context), input.id)),
	},
}
