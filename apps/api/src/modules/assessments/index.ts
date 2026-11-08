import { defineModule } from '#/kernel/module.ts'
import { submissionFilePurpose } from './files.ts'
import { expireAttemptsJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { assessmentsRouter, assignmentRouter, quizRouter } from './router.ts'

export default defineModule({
	name: 'assessments',
	router: { assessments: assessmentsRouter, quiz: quizRouter, assignment: assignmentRouter },
	files: [submissionFilePurpose],
	jobs: [expireAttemptsJob],
	permissions,
})
