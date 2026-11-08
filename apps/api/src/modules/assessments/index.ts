import { defineModule } from '#/kernel/module.ts'
import { submissionReviewedEmail } from './emails/submission-reviewed.tsx'
import { commentFilePurpose, submissionFilePurpose } from './files.ts'
import { expireAttemptsJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { assessmentsRouter, assignmentRouter, quizRouter, reviewRouter } from './router.ts'
import { reviewedEmailSubscriber } from './subscribers.ts'

export default defineModule({
	name: 'assessments',
	router: { assessments: assessmentsRouter, quiz: quizRouter, assignment: assignmentRouter, review: reviewRouter },
	files: [submissionFilePurpose, commentFilePurpose],
	emails: [submissionReviewedEmail],
	subscribers: [reviewedEmailSubscriber],
	jobs: [expireAttemptsJob],
	permissions,
})
