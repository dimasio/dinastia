// Реализация контракта assessments (скилл api-endpoints): процедуры сотрудников — mw.host → session → school → tenantTx →
// member → can(…); логика — question.service.ts.
import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { can } from '#/permissions.ts'
import {
	archiveBankQuestion,
	createBankQuestion,
	getBankQuestion,
	listBank,
	listTags,
	removeTag,
	renameTag,
	updateBankQuestion,
} from './question.service.ts'

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
