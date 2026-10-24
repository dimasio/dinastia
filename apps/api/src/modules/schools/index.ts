import { defineModule } from '#/kernel/module.ts'
import { permissions } from './permissions.ts'
import { invitationsRouter, membersRouter, schoolsRouter } from './router.ts'

export default defineModule({
	name: 'schools',
	router: { schools: schoolsRouter, invitations: invitationsRouter, members: membersRouter },
	permissions,
})
