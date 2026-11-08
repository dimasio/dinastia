import { defineModule } from '#/kernel/module.ts'
import { enrolledEmail } from './emails/enrolled.tsx'
import { expireEnrollmentsJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { learningRouter, learnRouter } from './router.ts'

export default defineModule({
	name: 'learning',
	router: { learn: learnRouter, learning: learningRouter },
	permissions,
	jobs: [expireEnrollmentsJob],
	emails: [enrolledEmail],
})
