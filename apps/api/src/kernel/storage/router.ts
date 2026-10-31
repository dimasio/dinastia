// Реализация filesContract (скилл files-media).

import { can } from '../../permissions.ts'
import { impl, mw, schoolCtx } from '../orpc.ts'
import { rateLimit } from '../rate-limit/rate-limit.ts'
import { completeUpload, createUpload } from './files.ts'

const file = () => impl.files
export const filesRouter = {
	createUpload: file()
		.createUpload.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('files.upload'))
		.use(rateLimit({ name: 'files.upload', max: 60, windowSeconds: 600, by: 'member' }))
		.handler(({ input, context }) => createUpload(schoolCtx(context), input)),

	complete: file()
		.complete.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('files.upload'))
		.handler(({ input, context }) => completeUpload(schoolCtx(context), input.id)),
}
