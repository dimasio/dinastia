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
import { memberDataExport } from './member-data.ts'
import { permissions } from './permissions.ts'
import { learningPersonalData } from './personal-data.ts'
import { joinRouter, learningRouter, learnRouter, studentsRouter } from './router.ts'
import { coursePublishedSubscriber, lessonPublishedSubscriber, progressRulesSubscriber } from './subscribers.ts'

export default defineModule({
	name: 'learning',
	router: { learn: learnRouter, learning: learningRouter, join: joinRouter, students: studentsRouter },
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
	exports: [courseStudentsExport, memberDataExport],
	personalData: learningPersonalData,
})
