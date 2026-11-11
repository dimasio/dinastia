import { defineModule } from '#/kernel/module.ts'
import { courseInvitationEmail } from './emails/course-invitation.tsx'
import { deadlineReminderEmail } from './emails/deadline-reminder.tsx'
import { enrolledEmail } from './emails/enrolled.tsx'
import { lessonsOpenedEmail } from './emails/lessons-opened.tsx'
import { courseStudentsExport } from './exports.ts'
import {
	deadlineRemindersJob,
	expireEnrollmentsJob,
	lessonOpenedNoticesJob,
	recalcCourseProgressJob,
	sendCourseInvitationJob,
} from './jobs.ts'
import { permissions } from './permissions.ts'
import { joinRouter, learningRouter, learnRouter } from './router.ts'
import { coursePublishedSubscriber, lessonPublishedSubscriber, progressRulesSubscriber } from './subscribers.ts'

export default defineModule({
	name: 'learning',
	router: { learn: learnRouter, learning: learningRouter, join: joinRouter },
	permissions,
	jobs: [
		expireEnrollmentsJob,
		sendCourseInvitationJob,
		recalcCourseProgressJob,
		deadlineRemindersJob,
		lessonOpenedNoticesJob,
	],
	subscribers: [lessonPublishedSubscriber, coursePublishedSubscriber, progressRulesSubscriber],
	emails: [enrolledEmail, courseInvitationEmail, deadlineReminderEmail, lessonsOpenedEmail],
	exports: [courseStudentsExport],
})
