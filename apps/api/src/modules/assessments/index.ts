import { defineModule } from '#/kernel/module.ts'
import { permissions } from './permissions.ts'
import { assessmentsRouter } from './router.ts'

export default defineModule({
	name: 'assessments',
	router: { assessments: assessmentsRouter },
	permissions,
})
