import { defineModule } from '#/kernel/module.ts'
import { invitationEmail } from './emails/invitation.tsx'
import { sendInvitationJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { invitationsRouter, membersRouter, schoolsRouter } from './router.ts'

export default defineModule({
	name: 'schools',
	router: { schools: schoolsRouter, invitations: invitationsRouter, members: membersRouter },
	permissions,
	jobs: [sendInvitationJob],
	emails: [invitationEmail],
})
