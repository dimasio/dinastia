// Реализация exportsContract (скилл documents).
import { can } from '../../permissions.ts'
import { impl, mw, schoolCtx } from '../orpc.ts'
import { rateLimit } from '../rate-limit/rate-limit.ts'
import { getExport, startExport } from './exports.ts'

const exp = () => impl.exports
export const exportsRouter = {
	start: exp()
		.start.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('exports.use'))
		.use(rateLimit({ name: 'exports.start', max: 20, windowSeconds: 600, by: 'member' }))
		.handler(({ input, context }) => startExport(schoolCtx(context), input)),

	get: exp()
		.get.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('exports.use'))
		.handler(({ input, context }) => getExport(schoolCtx(context), input.id)),
}
