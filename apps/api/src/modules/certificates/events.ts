// События модуля certificates (скилл events-automations, domain.md §4): PDF сертификата готов — письмо ученику (4.8).
import { z } from 'zod'
import { defineEvent } from '#/kernel/events.ts'

export const certificateIssued = defineEvent(
	'certificate.issued',
	z.object({ certificateId: z.uuid(), enrollmentId: z.uuid(), courseId: z.uuid(), memberId: z.uuid() }),
)
