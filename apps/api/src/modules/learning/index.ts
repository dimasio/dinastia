import { defineModule } from '#/kernel/module.ts'
import { courseInvitationEmail } from './emails/course-invitation.tsx'
import { enrolledEmail } from './emails/enrolled.tsx'
import { expireEnrollmentsJob, sendCourseInvitationJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { joinRouter, learningRouter, learnRouter } from './router.ts'

export default defineModule({
	name: 'learning',
	router: { learn: learnRouter, learning: learningRouter, join: joinRouter },
	permissions,
	jobs: [expireEnrollmentsJob, sendCourseInvitationJob],
	emails: [enrolledEmail, courseInvitationEmail],
})
