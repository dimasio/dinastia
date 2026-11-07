// События модуля learning (скилл events-automations, domain.md §4). Подписчики — сертификаты и уведомления (фаза 4).
import { z } from 'zod'
import { defineEvent } from '#/kernel/events.ts'

export const lessonCompleted = defineEvent(
	'lesson.completed',
	z.object({ enrollmentId: z.uuid(), lessonId: z.uuid(), courseId: z.uuid() }),
)

export const enrollmentCompleted = defineEvent(
	'enrollment.completed',
	z.object({ enrollmentId: z.uuid(), courseId: z.uuid() }),
)
