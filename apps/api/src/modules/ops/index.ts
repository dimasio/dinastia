// Консоль оператора SaaS (5.6, спека ops.md, D-026).
import { defineModule } from '#/kernel/module.ts'
import { permissions } from './permissions.ts'
import { opsRouter } from './router.ts'

export default defineModule({
	name: 'ops',
	router: { ops: opsRouter },
	permissions,
})
