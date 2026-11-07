import { defineModule } from '#/kernel/module.ts'
import { permissions } from './permissions.ts'
import { learnRouter } from './router.ts'

export default defineModule({
	name: 'learning',
	router: { learn: learnRouter },
	permissions,
})
