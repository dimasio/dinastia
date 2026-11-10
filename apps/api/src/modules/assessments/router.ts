// Реализация контракта assessments (скилл api-endpoints): процедуры сотрудников — mw.host → session → school → tenantTx →
// member → can(…); логика — question.service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { can } from '#/permissions.ts'
import { getAttemptForReview, gradeAttempt } from './grading.service.ts'
import {
	archiveBankQuestion,
	createBankQuestion,
	getBankQuestion,
	listBank,
	listTags,
	lookupQuestions,
	removeTag,
	renameTag,
	updateBankQuestion,
} from './question.service.ts'
import { getAttempt, getQuizState, resultOf, saveAnswer, startAttempt, submitAttempt } from './quiz.service.ts'
import { commentAsReviewer, getForReview, listQueue } from './review.service.ts'
import { listMyRevisions } from './revisions.service.ts'
import { getAssignment, replyAsStudent, reviewSubmission, saveDraft, submitAssignment } from './submission.service.ts'

const chain = () => impl.assessments

export const assessmentsRouter = {
	questions: {
		list: chain()
			.questions.list.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.read'))
			.handler(({ input, context }) => listBank(schoolCtx(context), input)),
		get: chain()
			.questions.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.read'))
			.handler(({ input, context }) => getBankQuestion(schoolCtx(context), input.id)),
		lookup: chain()
			.questions.lookup.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.read'))
			.handler(({ input, context }) => lookupQuestions(schoolCtx(context), input.ids)),
		create: chain()
			.questions.create.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.manage'))
			.handler(({ input, context }) => createBankQuestion(schoolCtx(context), input)),
		update: chain()
			.questions.update.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.manage'))
			.handler(({ input, context }) => updateBankQuestion(schoolCtx(context), input)),
		archive: chain()
			.questions.archive.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.manage'))
			.handler(({ input, context }) => archiveBankQuestion(schoolCtx(context), input.id)),
	},
	tags: {
		list: chain()
			.tags.list.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.read'))
			.handler(({ input, context }) => listTags(schoolCtx(context), input.courseId)),
		rename: chain()
			.tags.rename.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.manage'))
			.handler(({ input, context }) => renameTag(schoolCtx(context), input)),
		remove: chain()
			.tags.remove.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('assessments.bank.manage'))
			.handler(({ input, context }) => removeTag(schoolCtx(context), input.id)),
	},
}

/** Прохождение теста (карточка 3.3): процедуры ученика. */
export const quizRouter = {
	get: impl.quiz.get
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => getQuizState(schoolCtx(context), input)),
	start: impl.quiz.start
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => startAttempt(schoolCtx(context), input)),
	attempt: impl.quiz.attempt
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => getAttempt(schoolCtx(context), input.attemptId)),
	answer: impl.quiz.answer
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => saveAnswer(schoolCtx(context), input)),
	submit: impl.quiz.submit
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => submitAttempt(schoolCtx(context), input.attemptId)),
	result: impl.quiz.result
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.attempt'))
		.handler(({ input, context }) => resultOf(schoolCtx(context), input.attemptId)),
}

/** Домашнее задание (карточка 3.4): сдача ученика и проверка преподавателем. */
export const assignmentRouter = {
	revisions: impl.assignment.revisions
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.submit'))
		.handler(({ context }) => listMyRevisions(schoolCtx(context))),
	get: impl.assignment.get
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.submit'))
		.handler(({ input, context }) => getAssignment(schoolCtx(context), input)),
	saveDraft: impl.assignment.saveDraft
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.submit'))
		.handler(({ input, context }) => saveDraft(schoolCtx(context), input)),
	submit: impl.assignment.submit
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.submit'))
		.handler(({ input, context }) => submitAssignment(schoolCtx(context), input)),
	reply: impl.assignment.reply
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.submit'))
		.handler(({ input, context }) => replyAsStudent(schoolCtx(context), input)),
	review: impl.assignment.review
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => reviewSubmission(schoolCtx(context), input)),
}

/** Очередь проверки (карточка 3.5): проверяющие — admin, teacher, curator (область — `reviewScope`). */
export const reviewRouter = {
	list: impl.review.list
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => listQueue(schoolCtx(context), input)),
	get: impl.review.get
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => getForReview(schoolCtx(context), input.submissionId)),
	attempt: impl.review.attempt
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => getAttemptForReview(schoolCtx(context), input.attemptId)),
	gradeAttempt: impl.review.gradeAttempt
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => gradeAttempt(schoolCtx(context), input)),
	comment: impl.review.comment
		.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('assessments.review'))
		.handler(({ input, context }) => commentAsReviewer(schoolCtx(context), input)),
}
