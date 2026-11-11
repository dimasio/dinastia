// Реализация контракта certificates (скилл api-endpoints): сотрудники — mw.host → session → school → tenantTx → member → can;
// проверка по номеру — публично (без входа), с лимитом по IP.

import { impl, mw, schoolCtx } from '#/kernel/orpc.ts'
import { rateLimit } from '#/kernel/rate-limit/rate-limit.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { can } from '#/permissions.ts'
import {
	downloadCertificate,
	downloadMyCertificate,
	getTemplate,
	issueCompleted,
	listCertificates,
	listMyCertificates,
	previewTemplate,
	revokeCertificate,
	saveTemplate,
	verifyCertificate,
} from './service.ts'

const c = () => impl.certificates

export const certificatesRouter = {
	template: {
		get: c()
			.template.get.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('certificates.manage'))
			.handler(({ input, context }) => getTemplate(schoolCtx(context), input.courseId)),
		save: c()
			.template.save.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('certificates.manage'))
			.handler(({ input, context }) => saveTemplate(schoolCtx(context), input)),
		preview: c()
			.template.preview.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('certificates.manage'))
			.handler(({ input, context }) => previewTemplate(schoolCtx(context), input)),
	},
	list: c()
		.list.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('certificates.view'))
		.handler(({ input, context }) => listCertificates(schoolCtx(context), input)),
	issueCompleted: c()
		.issueCompleted.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('certificates.manage'))
		.handler(({ input, context }) => issueCompleted(schoolCtx(context), input.courseId)),
	revoke: c()
		.revoke.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('certificates.manage'))
		.handler(({ input, context }) => revokeCertificate(schoolCtx(context), input.id)),
	download: c()
		.download.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('certificates.view'))
		.handler(({ input, context }) => downloadCertificate(schoolCtx(context), input.id)),
	my: {
		list: c()
			.my.list.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('certificates.own'))
			.handler(({ context }) => listMyCertificates(schoolCtx(context))),
		download: c()
			.my.download.use(mw.host)
			.use(mw.session)
			.use(mw.school)
			.use(mw.tenantTx)
			.use(mw.member)
			.use(can('certificates.own'))
			.handler(({ input, context }) => downloadMyCertificate(schoolCtx(context), input.id)),
	},
	verify: c()
		.verify.use(mw.host)
		.use(mw.school)
		.use(rateLimit({ name: 'certificates.verify', max: 30, windowSeconds: 600, by: 'ip' }))
		.use(mw.tenantTx)
		.handler(({ input, context }) => verifyCertificate(tenantCtx(context.db, context.school, context), input)),
}
