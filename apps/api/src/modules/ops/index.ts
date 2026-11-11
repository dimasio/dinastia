// Консоль оператора SaaS (5.6, спека ops.md, D-026).
import { defineModule } from '#/kernel/module.ts'
import { suspensionEmail } from './emails/suspension.tsx'
import { permissions } from './permissions.ts'
import { opsRouter } from './router.ts'
import { schoolStatsJob } from './stats.ts'
import { suspensionNoticeJob } from './suspension.ts'

export default defineModule({
	name: 'ops',
	router: { ops: opsRouter },
	permissions,
	jobs: [schoolStatsJob, suspensionNoticeJob],
	emails: [suspensionEmail],
})
