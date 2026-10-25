// Фоновые задачи модуля schools (скилл background-jobs).
import { Id } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineJob } from '#/kernel/jobs.ts'
import { sendInvitation } from './invitations.service.ts'

/** Выпустить токен приглашения и отправить письмо (токен не попадает в очередь). */
export const sendInvitationJob = defineJob({
	name: 'schools.send-invitation',
	schema: z.object({ invitationId: Id }),
	retry: { limit: 5, backoff: true },
	handler: (ctx, d) => sendInvitation(ctx, d.invitationId),
})
