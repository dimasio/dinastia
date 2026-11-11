// Реализация settingsContract (скилл settings): экран /admin/settings из реестра настроек модулей. Право экрана —
// `schools.settings.manage` (настройки — школы); что менять, решает `edit` каждого поля.
import { can } from '../../permissions.ts'
import type { SchoolCtx } from '../context.ts'
import { fail } from '../errors.ts'
import { impl, mw, schoolCtx } from '../orpc.ts'
import { allSettings } from '../registry.ts'
import { updateSettings } from './settings.ts'
import { settingsView } from './view.ts'

async function list(ctx: SchoolCtx) {
	const out = []
	for (const def of allSettings()) out.push(...settingsView(def, await ctx.settings.all(def), ctx.member.role))
	return out
}

const s = () => impl.settings
export const settingsRouter = {
	list: s()
		.list.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.settings.manage'))
		.handler(({ context }) => list(schoolCtx(context))),

	update: s()
		.update.use(mw.host)
		.use(mw.session)
		.use(mw.school)
		.use(mw.tenantTx)
		.use(mw.member)
		.use(can('schools.settings.manage'))
		.handler(async ({ input, context }) => {
			const ctx = schoolCtx(context)
			const def = allSettings().find((d) => d.module === input.module)
			if (!def) return fail.notFound('SETTING_UNKNOWN', { module: input.module })
			await updateSettings(ctx, def, input.patch as never)
			return list(ctx)
		}),
}
