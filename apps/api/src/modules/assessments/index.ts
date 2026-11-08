import { defineModule } from '#/kernel/module.ts'
import { expireAttemptsJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { assessmentsRouter, quizRouter } from './router.ts'

export default defineModule({
	name: 'assessments',
	router: { assessments: assessmentsRouter, quiz: quizRouter },
	jobs: [expireAttemptsJob],
	permissions,
})
